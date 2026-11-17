import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bin, root, run, typescriptArgs } from '../support/auth-project'
import { databaseReachable, testDatabaseUrl } from '../support/database'
import { serveOnFreePort, signIn, stopProcess, withDatabase } from '../support/serve-process'

const url = testDatabaseUrl()
const reachable = await databaseReachable(url)
const scratchDir = path.join(root, 'tests/apps/scratch')

// The CLI's subprocesses start slowly on a busy machine.
const timeout = 180_000

// An app that only signs people in: the scratch preset's files with a config/index.ts that exports nothing, inside the
// preset so it resolves the same packages, on a database of its own with the auth schema and one admin.
describe.skipIf(!reachable)('an app with no resources', () => {
  const projectDir = path.join(scratchDir, `.no-resources-${randomBytes(4).toString('hex')}`)
  const database = `protobase_no_resources_${randomBytes(4).toString('hex')}`
  const email = 'no-resources@example.com'
  const password = 'a-long-test-password'
  const env = { DATABASE_URL: withDatabase(url, database), PROTOBASE_SECRET: randomBytes(32).toString('base64'), PROTOBASE_URL: 'http://localhost' }
  const configFile = path.join(projectDir, 'protobase.config.ts')
  let presetConfig = ''
  // The preset's config with `resources: 'none'`, or without it.
  const declareNone = (declared: boolean) => writeFile(configFile, declared ? presetConfig.replace('defineConfig({', "defineConfig({\n  resources: 'none',") : presetConfig)
  const doctor = () => run([bin, 'doctor'], projectDir, env)
  let child: ChildProcess | undefined

  beforeAll(async () => {
    for (const file of execFileSync('git', ['ls-files', '-z'], { cwd: scratchDir, encoding: 'utf8' }).split('\0').filter(Boolean)) {
      await mkdir(path.dirname(path.join(projectDir, file)), { recursive: true })
      await cp(path.join(scratchDir, file), path.join(projectDir, file))
    }
    await writeFile(path.join(projectDir, 'config/index.ts'), 'export {}\n')
    presetConfig = await readFile(configFile, 'utf8')
    const admin = postgres(withDatabase(url, 'postgres'), { max: 1, onnotice: () => {} })
    await admin.unsafe(`create database ${database}`)
    await admin.end()
    const migrated = await run(typescriptArgs('db/migrate.ts'), projectDir, env)
    if (migrated.status !== 0) throw new Error(`migrations failed:\n${migrated.stderr}`)
    const created = await run([bin, 'users', 'create', email, '--role', 'admin', '--password-stdin'], projectDir, env, `${password}\n`)
    if (created.status !== 0) throw new Error(`users create failed:\n${created.stderr}`)
  }, timeout)

  afterAll(async () => {
    await stopProcess(child)
    await rm(projectDir, { recursive: true, force: true })
    const cleanup = postgres(withDatabase(url, 'postgres'), { max: 1, onnotice: () => {} })
    await cleanup.unsafe(`drop database if exists ${database} with (force)`)
    await cleanup.end()
  }, 60_000)

  it("passes doctor only when its config says it has none, and fails it when it says so but exports one", async () => {
    await declareNone(false)
    const undeclared = await doctor()
    expect(undeclared.status).toBe(1)
    expect(undeclared.stderr).toContain(`No resources exported from ${path.join(projectDir, 'config')}/index.ts; an app with none on purpose says so with resources: 'none' in its config`)

    await declareNone(true)
    const declared = await doctor()
    expect(declared.stderr).toBe('')
    expect(declared.stdout).toContain("Checked 0 resources and the server's startup checks: 0 errors, 0 warnings.")

    await mkdir(path.join(projectDir, 'config/notes'), { recursive: true })
    await writeFile(path.join(projectDir, 'config/notes/data.ts'), "import { f, resource } from '@protobase/schema'\nexport const notes = resource('notes').table('notes').fields({ id: f.integer(), body: f.text() }).primaryKey((r) => r.id)\n")
    await writeFile(path.join(projectDir, 'config/index.ts'), "export * from './notes/data'\n")
    try {
      const both = await doctor()
      expect(both.status).toBe(1)
      expect(both.stderr).toContain("exports a resource, but the config says the app has none (resources: 'none'): remove that key, or the resources")
    } finally {
      await writeFile(path.join(projectDir, 'config/index.ts'), 'export {}\n')
      await rm(path.join(projectDir, 'config/notes'), { recursive: true, force: true })
    }
  }, timeout)

  it('is built and served: sign-in, its token signing keys and the API with no resources', async () => {
    await declareNone(true)
    const built = await run([bin, 'build', '--out', 'dist'], projectDir, env)
    if (built.status !== 0) throw new Error(`protobase build failed:\n${built.stderr}`)
    const served = await serveOnFreePort((port) => {
      child = spawn(process.execPath, [bin, 'serve', 'dist'], { cwd: projectDir, env: { ...process.env, ...env, PORT: String(port), PROTOBASE_URL: `http://localhost:${port}` } })
      return child
    }, timeout - 30_000)
    try {
      expect((await fetch(`${served.base}/api/auth/jwks`)).status).toBe(200)
      const token = await signIn(served.base, email, password)
      const meta = await fetch(`${served.base}/api/meta`, { headers: { authorization: `Bearer ${token}` } })
      expect(meta.status).toBe(200)
      expect(((await meta.json()) as { resources: unknown[] }).resources).toEqual([])
      expect((await fetch(`${served.base}/api/openapi.json`, { headers: { authorization: `Bearer ${token}` } })).status).toBe(200)
    } finally {
      await stopProcess(child)
    }
  }, timeout)
})
