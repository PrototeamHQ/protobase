import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import postgres from 'postgres'

export const root = path.resolve(__dirname, '../../../..')
export const bin = path.join(root, 'packages/cli/bin/protobase-source.mjs')
// Arguments that run a TypeScript file of the repository on the test's own runtime: Bun loads it itself, Node
// through tsx.
export const typescriptArgs = (file: string) => (process.versions.bun ? [file] : ['--import', 'tsx', file])

export const run = (args: string[], cwd: string, env: Record<string, string>, stdin?: string) =>
  new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, args, { cwd, env: { ...process.env, ...env } })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.on('close', (status) => resolve({ status, stdout, stderr }))
    child.stdin.end(stdin)
  })

const secret = 'integration-test-secret-integration-test'

// The ERP's orders name their owner by an integer id, so users take theirs from a sequence the migration makes.
const hooksFile = `import { sql } from 'kysely'
import type { AuthHooks } from '@protobase/server'
export const generateUserId: AuthHooks['generateUserId'] = async ({ db }) =>
  (await sql<{ id: string }>\`select nextval(\${\`\${process.env.TEST_AUTH_SCHEMA}.user_ids\`}::regclass)::text as id\`.execute(db)).rows[0]!.id
`

const configFile = `export default ({ env }: { env: Record<string, string | undefined> }) => ({
  url: 'http://localhost:1',
  secret: '${secret}',
  auth: { schema: env.TEST_AUTH_SCHEMA },
  authenticate: { tenant: 1 },
})
`

// The ERP's resources and roles, which the project's config/ re-exports for the convention to find.
const resourcesFile = "export * from '../../config'\n"
const rolesFile = "export { roles } from '../../config/roles'\n"

// The auth store's tables in the project's own schema, as `protobase auth migration` would write them.
const migrateFile = `import { Kysely, PostgresDialect } from 'kysely'
import pg from 'pg'
import { authSchemaMigration } from '@protobase/server'
import { appAuthOptions, createAuth } from '@protobase/server/internal'
const schema = process.env.TEST_AUTH_SCHEMA!
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 })
await pool.query(\`create schema \${schema}\`)
await pool.query(\`create sequence \${schema}.user_ids\`)
const auth = createAuth(appAuthOptions({ baseURL: 'http://localhost:1', secret: '${secret}', schema }, { pool, db: new Kysely<any>({ dialect: new PostgresDialect({ pool }) }) }))
await pool.query((await authSchemaMigration(auth))!)
await pool.end()
process.exit(0)
`

/**
 * A throwaway project inside examples/erp (so it resolves the same packages) with its own Better Auth store, in a
 * schema of the database at `databaseUrl` that `dispose` drops. Its config/ re-exports the ERP's resources and roles,
 * which its bottom bar names, and auth/hooks.ts takes user ids from a sequence of its own.
 */
export const createAuthProject = async (databaseUrl: string) => {
  const suffix = randomBytes(4).toString('hex')
  const schema = `protobase_cli_test_${suffix}`
  const projectDir = path.join(root, 'examples/erp', `.cli-test-${suffix}`)
  const env = { DATABASE_URL: databaseUrl, TEST_AUTH_SCHEMA: schema }

  await mkdir(projectDir, { recursive: true })
  await mkdir(path.join(projectDir, 'auth'), { recursive: true })
  await mkdir(path.join(projectDir, 'config'), { recursive: true })
  await writeFile(path.join(projectDir, 'auth/hooks.ts'), hooksFile)
  await writeFile(path.join(projectDir, 'config/index.ts'), resourcesFile)
  await writeFile(path.join(projectDir, 'config/roles.ts'), rolesFile)
  await writeFile(path.join(projectDir, 'protobase.config.ts'), configFile)
  await writeFile(path.join(projectDir, 'migrate.ts'), migrateFile)
  const migrated = await run(typescriptArgs(path.join(projectDir, 'migrate.ts')), projectDir, env)
  if (migrated.status !== 0) throw new Error(`auth migration failed:\n${migrated.stderr}`)

  const dispose = async () => {
    await rm(projectDir, { recursive: true, force: true })
    const cleanup = postgres(databaseUrl, { max: 1, onnotice: () => {} })
    await cleanup.unsafe(`drop schema if exists ${schema} cascade`)
    await cleanup.end()
  }
  return { projectDir, env, dispose }
}
