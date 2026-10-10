import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bin, createAuthProject, run } from '../support/auth-project'
import { databaseReachable, testDatabaseUrl } from '../support/database'

const url = testDatabaseUrl()

const reachable = await databaseReachable(url)

// Booting the real CLI (ts-morph, Vite, the server, Better Auth) takes seconds, and several times that when the
// machine is busy with other test runs, so the default 5 s timeout is not enough for a subprocess.
const subprocessTimeout = 120_000

// The binary itself, once: bin → Vite's module runner → the project's protobase.config.ts → a pg Pool. What the commands do is
// covered in process by users.test.ts.
describe.skipIf(!reachable)('protobase users create and token (real binary)', () => {
  let project: Awaited<ReturnType<typeof createAuthProject>>
  let created: Awaited<ReturnType<typeof run>>
  let issued: Awaited<ReturnType<typeof run>>

  beforeAll(async () => {
    project = await createAuthProject(url)
    const { projectDir, env } = project
    created = await run([bin, 'users', 'create', 'me@example.com', '--role', 'viewer', '--password-stdin'], projectDir, env, 'a-long-test-password\n')
    issued = await run([bin, 'token', 'me@example.com', '--ttl', '5m'], projectDir, env)
  }, subprocessTimeout)

  afterAll(() => project?.dispose(), 30_000)

  it('creates the first admin from --password-stdin, whatever --role says', () => {
    expect(created.stderr).toBe('')
    expect(created.stdout).toBe('Created admin me@example.com\n')
  })

  it('prints only a JWT on stdout for an existing user', () => {
    expect(issued.status).toBe(0)
    expect(issued.stdout).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+\n$/)
  })
})
