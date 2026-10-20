import { createHash } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import postgres from 'postgres'

const root = path.join(import.meta.dirname, '..', '..')

/** The Postgres server the tests use: the docker-compose container, unless TEST_POSTGRES_URL names another. */
export const serverUrl = process.env.TEST_POSTGRES_URL ?? 'postgres://protobase:protobase@localhost:55432/postgres'

/**
 * Supabase's Postgres image initialised as a dedicated Protobase Cloud instance (test-support/supabase-postgres/), for
 * the snapshot tests that need Supabase's extensions: the docker-compose container, unless TEST_SUPABASE_POSTGRES_URL
 * names another. Its superuser is supabase_admin.
 */
export const supabaseServerUrl = process.env.TEST_SUPABASE_POSTGRES_URL ?? 'postgres://supabase_admin:protobase@localhost:55433/postgres'

/** PgBouncer in transaction mode in front of that server: the docker-compose service, unless TEST_PGBOUNCER_URL names another. */
export const poolerUrl = process.env.TEST_PGBOUNCER_URL ?? 'postgres://protobase:protobase@localhost:55442/postgres'

/**
 * One template database per example, migrated and seeded by `bun run test:db`. Every test run clones its own database
 * from these and drops it afterwards, so tests never touch the developer databases (`protobase`, `real_estate`, `property_portal`).
 * Small seeds clone fastest with `wal_log`, which needs no checkpoint. The ERP at medium scale, which the planner and
 * seek cases need, is the Postgres suite's alone (`bun run test:db postgres`); `file_copy` clones it in a third of the time.
 */
const example = (database: string, dir: string, scale: 'small' | 'medium', strategy: Strategy) =>
  ({ database, dir, scale, strategy, sources: [`${dir}/db/migrations`, `${dir}/seed`] }) as const

type Strategy = 'wal_log' | 'file_copy'

export const templates = {
  erp: example('protobase_test_template', 'examples/erp', 'small', 'wal_log'),
  realEstate: example('real_estate_test_template', 'examples/real-estate', 'small', 'wal_log'),
  propertyPortal: example('property_portal_test_template', 'examples/property-portal', 'small', 'wal_log'),
  erpMedium: example('protobase_medium_test_template', 'examples/erp', 'medium', 'file_copy'),
}

export type TemplateKey = keyof typeof templates
/**
 * A template database: what it is built from (files and directories, hashed into its comment), how it is cloned, and
 * the server it lives on, `serverUrl` unless it names Supabase's (`supabaseServerUrl`).
 */
export type Template = { database: string; strategy: Strategy; sources: readonly string[]; scale?: string; server?: 'supabase' }

/** The URL of the server `template` lives on. */
export const templateServer = (template: Pick<Template, 'server'>) => (template.server === 'supabase' ? supabaseServerUrl : serverUrl)

/** The environment variable that points the tests at the server `template` lives on. */
export const serverVariable = (template: Pick<Template, 'server'>) => (template.server === 'supabase' ? 'TEST_SUPABASE_POSTGRES_URL' : 'TEST_POSTGRES_URL')

/** The templates each suite's runs clone: the integration tests on every push, the Postgres suite when SQL changes. */
export const suites = {
  integration: ['erp', 'realEstate', 'propertyPortal'],
  postgres: ['erpMedium'],
} as const satisfies Record<string, readonly TemplateKey[]>

export type SuiteName = keyof typeof suites

export const databaseUrl = (database: string, server = serverUrl) => {
  const url = new URL(server)
  url.pathname = `/${database}`
  return url.toString()
}

/** The environment a test project runs with: DATABASE_URL names the run's own clone of the template. */
export const runEnvironment = (key: TemplateKey, runId: string) => ({
  DATABASE_URL: databaseUrl(`${templates[key].database.replace(/_template$/, '')}_run_${runId}`),
  TEST_DATABASE_TEMPLATE: key,
})

/** A connection to the server; a short timeout tells soon that none runs, a longer one waits out a busy server. */
export const connectServer = (timeoutSeconds = 2, server = serverUrl) => postgres(server, { max: 1, connect_timeout: timeoutSeconds, onnotice: () => {} })

/** Creates `database` as a copy of the template. */
export const cloneTemplate = async (template: Pick<Template, 'database' | 'strategy' | 'server'>, database: string) => {
  const sql = connectServer(15, templateServer(template))
  await sql.unsafe(`create database "${database}" template "${template.database}" strategy ${template.strategy}`)
  await sql.end()
}

export const dropDatabase = async (database: string, server = serverUrl) => {
  const sql = connectServer(15, server)
  await sql.unsafe(`drop database if exists "${database}" with (force)`)
  await sql.end()
}

const filesUnder = async (dir: string): Promise<string[]> => {
  const entries = await readdir(dir, { withFileTypes: true })
  const nested = await Promise.all(entries.map((entry) => (entry.isDirectory() ? filesUnder(path.join(dir, entry.name)) : [path.join(dir, entry.name)])))
  return nested.flat()
}

/** A hash of what a template is built from (its sources and scale), kept as the database's comment. */
export const sourceHash = async (template: Template) => {
  const files = (await Promise.all(template.sources.map(async (source) => {
    const full = path.join(root, source)
    return (await stat(full)).isDirectory() ? filesUnder(full) : [full]
  }))).flat().sort()
  const hash = createHash('sha256').update(template.scale ?? '')
  for (const file of files) hash.update(path.relative(root, file)).update(await readFile(file))
  return hash.digest('hex').slice(0, 16)
}

const unreachable = ['ECONNREFUSED', 'ENOTFOUND', 'CONNECT_TIMEOUT', 'ETIMEDOUT']

const answers = async (url: string) => {
  const sql = postgres(url, { max: 1, connect_timeout: 2, onnotice: () => {} })
  try {
    await sql`select 1`
    return true
  } catch (error) {
    if (unreachable.includes((error as { code?: string }).code ?? '')) return false
    throw error
  } finally {
    await sql.end()
  }
}

/** Whether the Postgres server answers at all. */
export const serverReachable = () => answers(serverUrl)

/**
 * Whether PgBouncer answers in front of the server, so the tests through it run. In CI it must: the Postgres suite
 * runs them, and a missing pooler fails the run instead of skipping them.
 */
export const poolerReachable = async () => {
  const reachable = await answers(databaseUrl('postgres', poolerUrl))
  if (!reachable && process.env.CI) throw new Error('No PgBouncer at TEST_PGBOUNCER_URL: CI must run the PgBouncer tests against a pooler service')
  return reachable
}

/** Whether the template exists and matches the current migrations and seed; `unreachable` without a server. */
export const templateState = async (template: Template) => {
  const sql = connectServer(2, templateServer(template))
  try {
    const [row] = await sql<{ hash: string | null }[]>`select shobj_description(oid, 'pg_database') as hash from pg_database where datname = ${template.database}`
    if (!row) return 'missing'
    return row.hash === (await sourceHash(template)) ? 'ready' : 'stale'
  } catch (error) {
    if (unreachable.includes((error as { code?: string }).code ?? '')) return 'unreachable'
    throw error
  } finally {
    await sql.end()
  }
}
