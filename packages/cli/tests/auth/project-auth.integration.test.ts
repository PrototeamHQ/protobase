import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bin, createAuthProject, run, typescriptArgs } from '../support/auth-project'
import { databaseReachable, testDatabaseUrl } from '../support/database'

const url = testDatabaseUrl()
const reachable = await databaseReachable(url)

// A script of the project's own, as a seed would be: it builds the project's sign-in with @protobase/cli/auth, as the
// users commands do, and calls the user functions of @protobase/server on it.
const scriptFile = `import { loadProjectAuth } from '@protobase/cli/auth'
import { createUser, issueToken, listUsers } from '@protobase/server'
const auth = await loadProjectAuth(process.cwd())
const created = await createUser(auth, { email: 'seed@example.com', password: 'a-long-seed-password' })
const users = await listUsers(auth)
const { token } = await issueToken(auth, { email: 'seed@example.com' })
process.stdout.write(JSON.stringify({ created, emails: users.map((user) => user.email), token }))
process.exit(0)
`

describe.skipIf(!reachable)('@protobase/cli/auth in a script of the project', () => {
  let project: Awaited<ReturnType<typeof createAuthProject>>

  beforeAll(async () => {
    project = await createAuthProject(url)
    await writeFile(path.join(project.projectDir, 'seed-users.ts'), scriptFile)
  }, 90_000)

  afterAll(() => project?.dispose(), 60_000)

  it('builds the sign-in the users commands use, with the hooks of auth/hooks.ts', async () => {
    const { projectDir, env } = project
    const script = await run(typescriptArgs(path.join(projectDir, 'seed-users.ts')), projectDir, env)
    expect(script.stderr).toBe('')
    const { created, emails, token } = JSON.parse(script.stdout)
    // The first user is an admin, and auth/hooks.ts gave it the first id of the project's own sequence.
    expect(created).toEqual({ id: '1', email: 'seed@example.com', role: 'admin' })
    expect(emails).toEqual(['seed@example.com'])
    expect(token).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/)
    const listed = await run([bin, 'users', 'list'], projectDir, env)
    expect(listed.stdout).toMatch(/seed@example\.com\s+admin/)
  }, 60_000)
})
