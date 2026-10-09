import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import postgres from 'postgres'

const root = path.join(import.meta.dirname, '..', '..')

/** The Postgres server the tests use: the docker-compose container, unless TEST_POSTGRES_URL names another. */
export const serverUrl = process.env.TEST_POSTGRES_URL ?? 'postgres://protobase:protobase@localhost:55432/postgres'

/**
 * One template database per example, migrated and seeded by `pnpm test:db`. Every test run clones its own database
 * from these and drops it afterwards, so tests never touch the developer databases (`protobase`, `real_estate`).
 * The ERP is seeded at medium scale, which the planner and seek cases need; `file_copy` clones it in a third of the time.
 */
export const templates = {
  erp: { database: 'protobase_test_template', dir: 'examples/erp', scale: 'medium', strategy: 'file_copy' },
  realEstate: { database: 'real_estate_test_template', dir: 'examples/real-estate', scale: 'small', strategy: 'wal_log' },
} as const

export type TemplateKey = keyof typeof templates
export type Template = (typeof templates)[TemplateKey]

export const databaseUrl = (database: string) => {
  const url = new URL(serverUrl)
  url.pathname = `/${database}`
  return url.toString()
}

/** The environment a test project runs with: DATABASE_URL names the run's own clone of the template. */
export const runEnvironment = (key: TemplateKey, runId: string) => ({
  DATABASE_URL: databaseUrl(`${templates[key].database.replace(/_template$/, '')}_run_${runId}`),
  TEST_DATABASE_TEMPLATE: key,
})

export const connectServer = () => postgres(serverUrl, { max: 1, connect_timeout: 2, onnotice: () => {} })

const filesUnder = async (dir: string): Promise<string[]> => {
  const entries = await readdir(dir, { withFileTypes: true })
  const nested = await Promise.all(entries.map((entry) => (entry.isDirectory() ? filesUnder(path.join(dir, entry.name)) : [path.join(dir, entry.name)])))
  return nested.flat()
}

/** A hash of what a template is built from (its migrations, seed and scale), kept as the database's comment. */
export const sourceHash = async (template: Template) => {
  const files = (await Promise.all(['db/migrations', 'seed'].map((part) => filesUnder(path.join(root, template.dir, part))))).flat().sort()
  const hash = createHash('sha256').update(template.scale)
  for (const file of files) hash.update(path.relative(root, file)).update(await readFile(file))
  return hash.digest('hex').slice(0, 16)
}

const unreachable = ['ECONNREFUSED', 'ENOTFOUND', 'CONNECT_TIMEOUT', 'ETIMEDOUT']

/** Whether the template exists and matches the current migrations and seed; `unreachable` without a server. */
export const templateState = async (template: Template) => {
  const sql = connectServer()
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
