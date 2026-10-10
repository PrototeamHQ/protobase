import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bin, createAuthProject, run } from '../support/auth-project'
import { databaseReachable, testDatabaseUrl } from '../support/database'

const root = path.resolve(__dirname, '../../../..')
const url = testDatabaseUrl()
const hasApp = ['index.html', 'main.tsx'].every((file) => existsSync(path.join(root, 'packages/ui/src/app', file)))

const reachable = await databaseReachable(url)

const freePort = () =>
  new Promise<number>((resolve) => {
    const server = createServer().listen(0, () => {
      const { port } = server.address() as { port: number }
      server.close(() => resolve(port))
    })
  })

// Subprocess startup (and the temporary auth database) is slow under load, so the hooks get a generous timeout.
const startupTimeout = 90_000

// Resolves with the child's output once it prints the ready line; rejects with that output if it exits first.
const untilReady = (child: ChildProcess) =>
  new Promise<void>((resolve, reject) => {
    let output = ''
    const timer = setTimeout(() => reject(new Error(`protobase dev not ready in time:\n${output}`)), startupTimeout - 5_000)
    const collect = (chunk: Buffer) => {
      output += chunk
      if (!output.includes('protobase dev ready')) return
      clearTimeout(timer)
      resolve()
    }
    child.stdout?.on('data', collect)
    child.stderr?.on('data', collect)
    child.once('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`protobase dev exited with ${code}:\n${output}`))
    })
  })

describe.skipIf(!reachable || !hasApp)('protobase dev in a project with real auth', () => {
  let child: ChildProcess
  let cacheDir: string
  let project: Awaited<ReturnType<typeof createAuthProject>>
  let token: string
  let port: number

  beforeAll(async () => {
    port = await freePort()
    cacheDir = await mkdtemp(path.join(tmpdir(), 'protobase-dev-cache-'))
    project = await createAuthProject(url)
    const { projectDir, env } = project
    await mkdir(path.join(projectDir, 'functions'))
    await writeFile(path.join(projectDir, 'functions/whoami.ts'), `import { defineFunction } from '@protobase/server'\nexport default defineFunction((request, { session }) => Response.json({ path: new URL(request.url).pathname, roles: session.user.roles }))\n`)
    const created = await run([bin, 'users', 'create', 'dev@example.com', '--password-stdin'], projectDir, env, 'a-long-test-password\n')
    if (created.status !== 0) throw new Error(`users create failed:\n${created.stderr}`)
    token = (await run([bin, 'token', 'dev@example.com'], projectDir, env)).stdout.trim()
    child = spawn(process.execPath, [bin, 'dev', '--port', String(port), '--cache-dir', cacheDir], {
      cwd: projectDir,
      env: { ...process.env, ...env, DATABASE_URL: url },
    })
    await untilReady(child)
  }, startupTimeout)

  afterAll(async () => {
    const exited = new Promise((resolve) => child?.once('exit', resolve))
    child?.kill('SIGTERM')
    await exited
    await rm(cacheDir, { recursive: true, force: true })
    await project?.dispose()
  }, 60_000)

  it('serves /api/meta to a bearer token and refuses everyone else', async () => {
    const meta = `http://localhost:${port}/api/meta`
    const signedIn = await fetch(meta, { headers: { authorization: `Bearer ${token}` } })
    expect(signedIn.status).toBe(200)
    expect(signedIn.headers.get('x-meta-version')).toBeTruthy()
    expect((await fetch(meta)).status).toBe(401)
  })

  it('serves the functions in ./functions to a bearer token and refuses everyone else', async () => {
    const whoami = `http://localhost:${port}/api/functions/whoami/me`
    const signedIn = await fetch(whoami, { headers: { authorization: `Bearer ${token}` } })
    expect(await signedIn.json()).toEqual({ path: '/me', roles: expect.any(Array) })
    expect((await fetch(whoami)).status).toBe(401)
  })
})
