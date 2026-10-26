import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildServeRuntime } from '../../packages/cli/src/build/serve-runtime'
import { protobaseVersion } from '../../packages/cli/src/version/version'
import { bin, root, run } from '../../packages/cli/tests/support/auth-project'
import { sendPastDueInvoice, serveOnFreePort, signIn, stopProcess } from '../../packages/cli/tests/support/serve-process'

/** A plain ERP bundle `protobase build` wrote, and what serving it takes: its database's environment, a user. */
export type BuiltErp = { bundle: string; env: Record<string, string>; email: string; password: string }

// Building the runtime and starting Bun are slow under load.
const startupTimeout = 120_000
const drainToken = 'the-operator-token'
// Each of the runtime's one-shot commands starts Bun and loads the bundle.
const commandTimeout = 60_000

/**
 * The production path: the config module of the ERP bundle served by the runtime under `bun --no-install`, from a
 * folder without node_modules, with only the environment a platform would pass. The runtime serves the API alone; given
 * the bundle folder, as a self-hosted image runs it, the app too, and it migrates and creates admins.
 * `erp` is read once the file's own setup has built the bundle.
 */
export const serveRuntimeScenarios = (erp: () => BuiltErp) => describe('the ERP bundle served by protobase-serve.js under Bun', () => {
  let dir: string
  let child: ChildProcess
  let base: string
  let output = ''
  let token = ''

  beforeAll(async () => {
    const { bundle, env } = erp()
    dir = await mkdtemp(path.join(tmpdir(), 'protobase-serve-'))
    await cp(bundle, path.join(dir, 'app'), { recursive: true })
    await buildServeRuntime({ outFile: path.join(dir, 'opt/protobase-serve.js'), bun: true })

    const served = await serveOnFreePort((port) => {
      output = ''
      child = spawn('bun', ['--no-install', 'opt/protobase-serve.js', 'app/protobase.config.js'], {
        cwd: dir,
        env: { PATH: process.env.PATH, ...env, PORT: String(port), BETTER_AUTH_URL: `http://localhost:${port}`, PROTOBASE_JOBS_DRAIN_TOKEN: drainToken },
      })
      child.stdout?.on('data', (chunk) => (output += chunk))
      child.stderr?.on('data', (chunk) => (output += chunk))
      return child
    }, startupTimeout - 10_000)
    base = served.base
  }, startupTimeout)

  afterAll(async () => {
    await stopProcess(child)
    if (dir) await rm(dir, { recursive: true, force: true })
  }, 60_000)

  it('runs from the config module of a complete bundle folder, pinned to its own Protobase version', async () => {
    expect(existsSync(path.join(dir, 'app/public/index.html'))).toBe(true)
    expect(JSON.parse(await readFile(path.join(dir, 'app/protobase.bundle.json'), 'utf8')).protobase).toBe(protobaseVersion)
  })

  it("with --bun, is written by Bun's bundler: its `// @bun` pragma, and non-ASCII text escaped", async () => {
    const bytes = await readFile(path.join(dir, 'opt/protobase-serve.js'))
    expect(bytes.toString('latin1').startsWith('// @bun\n')).toBe(true)
    expect(bytes.every((byte) => byte < 0x80)).toBe(true)
  })

  it('answers the health probe without a token', async () => {
    const response = await fetch(`${base}/health`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok' })
  })

  it('signs in with Better Auth and hands out a bearer token', async () => {
    token = await signIn(base, erp().email, erp().password)
    expect(token).toBeTruthy()
  })

  it("serves /api/meta to the token, naming the plugin of the bundle's own UI, and refuses everyone else", async () => {
    const meta = await fetch(`${base}/api/meta`, { headers: { authorization: `Bearer ${token}` } })
    expect(meta.status).toBe(200)
    expect(meta.headers.get('x-meta-version')).toBeTruthy()
    const body = await meta.json()
    expect(body.resources).toBeDefined()
    expect(body.plugins).toEqual([{ url: '/plugins/app/plugin.json' }])
    expect((await fetch(`${base}/api/meta`)).status).toBe(401)
  })

  it("keeps the config's non-ASCII text intact under Bun", async () => {
    const meta = await fetch(`${base}/api/meta`, { headers: { authorization: `Bearer ${token}` } })
    expect(JSON.stringify(await meta.json())).toContain('"prefix":"€"')
  })

  it('reads a resource from the ERP database', async () => {
    const response = await fetch(`${base}/api/v1/orders?page_size=1`, { headers: { authorization: `Bearer ${token}` } })
    expect(response.status).toBe(200)
    expect(Array.isArray((await response.json()).items)).toBe(true)
  })

  // The guide "Add a personal setting": the ERP's migration, resource, roles and Notifications tab, served together.
  it("saves the signed-in person's own notification setting from the account page, for SQL to read", async () => {
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
    const meta = await (await fetch(`${base}/api/meta`, { headers })).json()
    const settings = (node: { type?: string; props?: Record<string, unknown>; children?: unknown[] }): Record<string, unknown> | undefined =>
      node.type === 'Settings' ? node.props : node.children?.map((child) => settings(child as typeof node)).find(Boolean)
    expect(settings(meta.account.tree)).toMatchObject({ resource: 'notification_settings', fields: ['overdue_invoices'] })

    const url = `${base}/api/v1/notification_settings`
    expect((await (await fetch(url, { headers })).json()).items).toEqual([])
    const created = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ overdue_invoices: 'never' }) })
    expect(created.status).toBe(201)
    const { user_id: userId } = await created.json()
    const updated = await fetch(`${url}/${userId}`, { method: 'PATCH', headers: { ...headers, 'if-match': '*' }, body: JSON.stringify({ overdue_invoices: 'daily' }) })
    expect(updated.status).toBe(200)

    const sql = postgres(erp().env.DATABASE_URL!, { max: 1, onnotice: () => {} })
    const rows = await sql`select s.overdue_invoices from core.notification_settings s join auth."user" u on u.id = s.user_id where u.email = ${erp().email}`
    await sql.end()
    expect(rows.map((row) => row.overdue_invoices)).toEqual(['daily'])
  })

  it("runs the app's jobs: a sent invoice past its due date turns overdue", async () => {
    expect(await sendPastDueInvoice(base, token, erp().env.DATABASE_URL!)).toBe('overdue')
  })

  it('drains due jobs for the operator, and tells when the next one is due', async () => {
    const drain = (token: string) => fetch(`${base}/api/jobs/drain?seconds=20`, { method: 'POST', headers: { authorization: `Bearer ${token}` } })
    expect((await drain(token)).status).toBe(401)
    const drained = await drain(drainToken)
    expect(drained.status).toBe(200)
    // The nightly sweep's next run is the job due next.
    expect(await drained.json()).toEqual({ drained: true, remaining: 0, nextDue: expect.stringMatching(/T0[01]:00:00\.000Z$/) })
  })

  it('leaves the UI to the host when given the config module: no index.html from the runtime', async () => {
    expect((await fetch(`${base}/`, { headers: { accept: 'text/html' } })).status).toBe(404)
  })

  // The image's other commands, on the bundle folder: `docker compose run --rm migrate` and `… app create-admin`.
  const command = (args: string[], env: Record<string, string | undefined>, input = '') =>
    spawnSync('bun', ['--no-install', 'opt/protobase-serve.js', ...args], { cwd: dir, env: { PATH: process.env.PATH, ...env }, input, encoding: 'utf8' })

  const roleOf = async (email: string) => {
    const sql = postgres(erp().env.DATABASE_URL!, { max: 1, onnotice: () => {} })
    const rows = await sql`select role from auth."user" where email = ${email}`
    await sql.end()
    return rows[0]?.role as string | undefined
  }

  it("migrates with the bundle's own migrations, finding the database the ERP's migrate script made current", () => {
    const migrated = command(['migrate', 'app'], { DATABASE_URL: erp().env.DATABASE_URL })
    expect(migrated.stderr).toBe('')
    expect(migrated.stdout).toBe('the database is up to date\n')
    expect(migrated.status).toBe(0)
  }, commandTimeout)

  it('takes a bundle of any Protobase version, checking none: the host picks the runtime from it', async () => {
    const [major, minor] = protobaseVersion.split('.').map(Number)
    await cp(path.join(dir, 'app'), path.join(dir, 'newer'), { recursive: true })
    const manifest = JSON.parse(await readFile(path.join(dir, 'newer/protobase.bundle.json'), 'utf8'))
    await writeFile(path.join(dir, 'newer/protobase.bundle.json'), JSON.stringify({ ...manifest, protobase: `${major}.${minor! + 1}.0` }))
    const migrated = command(['migrate', 'newer'], { DATABASE_URL: erp().env.DATABASE_URL })
    expect(migrated.stderr).toBe('')
    expect(migrated.stdout).toBe('the database is up to date\n')
    expect(migrated.status).toBe(0)
  }, commandTimeout)

  it('creates an admin who signs in, with the password from stdin', async () => {
    const password = 'second-admin-password'
    const created = command(['create-admin', 'app', 'second@example.com', '--password-stdin'], erp().env, `${password}\n`)
    expect(created.stderr).toBe('')
    expect(created.stdout).toBe('Created admin second@example.com, shown in the app as Superuser\n')
    expect(created.status).toBe(0)
    expect(await signIn(base, 'second@example.com', password)).toBeTruthy()
  }, commandTimeout)

  it('leaves an existing account as it is, whatever case its address is given in, and prints no password', async () => {
    const refused = command(['create-admin', 'app', erp().email.toUpperCase(), '--generate-password'], erp().env)
    expect(refused.status).toBe(1)
    expect(refused.stdout).toBe('')
    expect(refused.stderr).not.toContain('Password')
    expect(await signIn(base, erp().email, erp().password)).toBeTruthy()
  }, commandTimeout)

  it("leaves an existing user's role, password and session as they are", async () => {
    const email = 'auditor@example.com'
    const password = 'auditor-test-password'
    const created = await run([bin, 'users', 'create', email, '--role', 'auditor', '--password-stdin'], path.join(root, 'examples/erp'), erp().env, `${password}\n`)
    if (created.status !== 0) throw new Error(`users create failed:\n${created.stderr}`)
    const signedIn = await fetch(`${base}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: base },
      body: JSON.stringify({ email, password }),
    })
    expect(signedIn.status).toBe(200)
    const cookie = signedIn.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ')

    const refused = command(['create-admin', 'app', email.toUpperCase(), '--generate-password'], erp().env)
    expect(refused.status).toBe(1)
    expect(refused.stdout).toBe('')
    expect(refused.stderr).not.toContain('Password')
    expect(await roleOf(email)).toBe('auditor')
    expect(await signIn(base, email, password)).toBeTruthy()
    const session = await fetch(`${base}/api/auth/get-session`, { headers: { cookie, origin: base } })
    expect(session.status).toBe(200)
    expect((await session.json()).user.email).toBe(email)
  }, commandTimeout)

  // The app's own pool, through Better Auth's schema check, fails as postgres.js does in `migrate`: without the secret.
  it('never prints the database password, on a wrong one or a server that refuses connections', () => {
    const wrong = new URL(erp().env.DATABASE_URL!)
    wrong.password = 'wrong-database-password-4f1c'
    const refused = new URL(erp().env.DATABASE_URL!)
    refused.host = '127.0.0.1:1'
    refused.password = 'refused-database-password-9b2e'
    for (const url of [wrong, refused]) {
      const result = command(['create-admin', 'app', 'nodb@example.com', '--generate-password'], { ...erp().env, DATABASE_URL: url.toString() })
      expect(result.status).toBe(1)
      expect(result.stdout + result.stderr).not.toContain(url.password)
      expect(result.stdout + result.stderr).not.toContain(url.toString())
    }
  }, commandTimeout)

  it('creates nobody without the auth secret or with a short password', async () => {
    const { BETTER_AUTH_SECRET: _, ...withoutSecret } = erp().env
    expect(command(['create-admin', 'app', 'nosecret@example.com', '--generate-password'], withoutSecret).status).toBe(1)
    const short = command(['create-admin', 'app', 'short@example.com', '--password-stdin'], erp().env, 'short\n')
    expect(short.status).toBe(1)
    expect(short.stderr).toContain('Choose a password of 12 to 128 characters')
    const empty = command(['create-admin', 'app', 'empty@example.com', '--password-stdin'], erp().env, '\n')
    expect(empty.status).toBe(1)
    // Neither flag, and no terminal to prompt on, as under `docker compose run -T`.
    expect(command(['create-admin', 'app', 'noprompt@example.com'], erp().env).status).toBe(1)
    for (const email of ['nosecret@example.com', 'short@example.com', 'empty@example.com', 'noprompt@example.com']) expect(await roleOf(email)).toBeUndefined()
  }, commandTimeout)

  it('shuts down cleanly on SIGTERM', async () => {
    const exited = new Promise<[number | null, string | null]>((resolve) => child.once('exit', (code, signal) => resolve([code, signal])))
    child.kill('SIGTERM')
    expect(await exited).toEqual([0, null])
    expect(output).not.toContain('error')
    await expect(fetch(`${base}/health`)).rejects.toThrow()
  })

  // The image's command: the bundle folder, served with its own copy of the app.
  describe('given the bundle folder', () => {
    beforeAll(async () => {
      const served = await serveOnFreePort((port) => {
        child = spawn('bun', ['--no-install', 'opt/protobase-serve.js', 'app'], { cwd: dir, env: { PATH: process.env.PATH, ...erp().env, PORT: String(port), BETTER_AUTH_URL: `http://localhost:${port}` } })
        return child
      }, startupTimeout - 10_000)
      base = served.base
    }, startupTimeout)

    it('serves the app and the API', async () => {
      const page = await fetch(`${base}/`, { headers: { accept: 'text/html' } })
      expect(page.status).toBe(200)
      expect(page.headers.get('content-type')).toContain('text/html')
      expect((await fetch(`${base}/health`)).status).toBe(200)
    })

    it("never serves the bundle's migrations, config module or manifest", async () => {
      const migration = (await readFile(path.join(dir, 'app/migrations/009_auth.sql'), 'utf8')).slice(0, 40)
      const config = (await readFile(path.join(dir, 'app/protobase.config.js'), 'utf8')).slice(0, 40)
      for (const pathname of ['/migrations/009_auth.sql', '/%2e%2e/migrations/009_auth.sql', '/..%2fmigrations/009_auth.sql', '/%2e%2e%2fprotobase.config.js', '/protobase.config.js', '/protobase.bundle.json', '/..%2fprotobase.bundle.json']) {
        const response = await fetch(`${base}${pathname}`)
        const body = await response.text()
        expect(response.status, pathname).toBe(404)
        expect(body).not.toContain(migration)
        expect(body).not.toContain(config)
        expect(body).not.toContain('"protobase"')
      }
    })

    it('makes no admin for an anonymous caller', async () => {
      const created = await fetch(`${base}/api/auth/admin/create-user`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: base },
        body: JSON.stringify({ email: 'intruder@example.com', password: 'intruder-password', name: 'intruder', role: 'admin' }),
      })
      expect(created.status).toBe(401)
      expect(await roleOf('intruder@example.com')).toBeUndefined()
    })

    it('stops on SIGTERM', async () => {
      const exited = new Promise<[number | null, string | null]>((resolve) => child.once('exit', (code, signal) => resolve([code, signal])))
      child.kill('SIGTERM')
      expect(await exited).toEqual([0, null])
    })
  })
})
