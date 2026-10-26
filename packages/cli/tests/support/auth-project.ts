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

const maintenanceUrl = (url: string) => {
  const target = new URL(url)
  target.pathname = '/postgres'
  return target.toString()
}

// The ERP's orders name their owner by an integer id, so users take theirs from a sequence the migration makes.
const authFile = `import pg from 'pg'
import { betterAuthAuthenticator, createAuth } from '@protobase/server'
const pool = new pg.Pool({ connectionString: process.env.TEST_AUTH_URL, max: 2 })
export const auth = createAuth({
  database: pool,
  generateUserId: async () => (await pool.query("select nextval('user_ids')::text as id")).rows[0].id,
  baseURL: 'http://localhost:1',
  secret: 'integration-test-secret-integration-test',
})
export const authenticate = betterAuthAuthenticator({ auth, tenant: 1 })
`

/**
 * A throwaway project inside examples/erp (so it resolves the same packages) with its own Better Auth store,
 * a temporary Postgres database that `dispose` drops. `config` re-exports the ERP resources and `roles` its roles,
 * which its bottom bar names, as its own protobase.config.ts does.
 */
export const createAuthProject = async (databaseUrl: string) => {
  const suffix = randomBytes(4).toString('hex')
  const database = `protobase_cli_test_${suffix}`
  const projectDir = path.join(root, 'examples/erp', `.cli-test-${suffix}`)
  const authUrl = new URL(databaseUrl)
  authUrl.pathname = `/${database}`
  const env = { TEST_AUTH_URL: authUrl.toString() }

  const admin = postgres(maintenanceUrl(databaseUrl), { max: 1, onnotice: () => {} })
  await admin.unsafe(`create database ${database}`)
  await admin.end()

  await mkdir(projectDir, { recursive: true })
  await writeFile(path.join(projectDir, 'auth.ts'), authFile)
  await writeFile(
    path.join(projectDir, 'protobase.config.ts'),
    `import * as config from '../config'\nimport { roles } from '../config/roles'\nimport { auth, authenticate } from './auth'\nexport default { config, auth, authenticate, options: { roles } }\n`,
  )
  await writeFile(
    path.join(projectDir, 'migrate.ts'),
    `import pg from 'pg'
import { authSchemaMigration } from '@protobase/server'
import { auth } from './auth'
const pool = new pg.Pool({ connectionString: process.env.TEST_AUTH_URL, max: 1 })
await pool.query((await authSchemaMigration(auth))!)
await pool.query('create sequence if not exists user_ids')
await pool.end()
process.exit(0)
`,
  )
  const migrated = await run(typescriptArgs(path.join(projectDir, 'migrate.ts')), projectDir, env)
  if (migrated.status !== 0) throw new Error(`auth migration failed:\n${migrated.stderr}`)

  const dispose = async () => {
    await rm(projectDir, { recursive: true, force: true })
    const cleanup = postgres(maintenanceUrl(databaseUrl), { max: 1, onnotice: () => {} })
    await cleanup.unsafe(`drop database if exists ${database} with (force)`)
    await cleanup.end()
  }
  return { projectDir, env, dispose }
}
