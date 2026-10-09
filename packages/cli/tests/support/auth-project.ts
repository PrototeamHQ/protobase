import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import postgres from 'postgres'

export const root = path.resolve(__dirname, '../../../..')
export const bin = path.join(root, 'packages/cli/bin/protobase-source.mjs')

export const run = (args: string[], cwd: string, env: Record<string, string>, stdin?: string) =>
  new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn('node', args, { cwd, env: { ...process.env, ...env } })
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

const authFile = `import pg from 'pg'
import { betterAuthAuthenticator, createAuth } from '@protobase/server'
export const auth = createAuth({
  database: new pg.Pool({ connectionString: process.env.TEST_AUTH_URL, max: 2 }),
  baseURL: 'http://localhost:1',
  secret: 'integration-test-secret-integration-test',
})
export const authenticate = betterAuthAuthenticator({ auth, tenant: 1 })
`

/**
 * A throwaway project inside examples/erp (so it resolves the same packages) with its own Better Auth store,
 * a temporary Postgres database that `dispose` drops. `config` re-exports the ERP resources, as its own
 * protobase.config.ts does.
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
    `import * as config from '../config'\nimport { auth, authenticate } from './auth'\nexport default { config, auth, authenticate }\n`,
  )
  await writeFile(
    path.join(projectDir, 'migrate.ts'),
    `import { getMigrations } from 'better-auth/db/migration'
import { auth } from './auth'
await (await getMigrations(auth.options)).runMigrations()
process.exit(0)
`,
  )
  const migrated = await run(['--import', 'tsx', path.join(projectDir, 'migrate.ts')], projectDir, env)
  if (migrated.status !== 0) throw new Error(`auth migration failed:\n${migrated.stderr}`)

  const dispose = async () => {
    await rm(projectDir, { recursive: true, force: true })
    const cleanup = postgres(maintenanceUrl(databaseUrl), { max: 1, onnotice: () => {} })
    await cleanup.unsafe(`drop database if exists ${database} with (force)`)
    await cleanup.end()
  }
  return { projectDir, env, dispose }
}
