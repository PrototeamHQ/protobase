import { connect } from '../../../examples/real-estate/db/connection'

// Tests run against the database vitest.config.ts clones for the run; without DATABASE_URL, connection.ts would
// fall back to the developer database.
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is unset: run the tests through vitest.config.ts, which names the run\'s own database')

const unreachable = ['ECONNREFUSED', 'ENOTFOUND', 'CONNECT_TIMEOUT', 'CONNECTION_CLOSED']
// The database lives beside the ERP's in one Postgres: a server without it (3D000) is as good as unreachable.
const missingDatabase = '3D000'

// True when the real estate database answers and has been seeded; any other failure is a real error and is rethrown.
export const databaseSeeded = async () => {
  const sql = connect({ max: 1, connect_timeout: 2 })
  try {
    const [table] = await sql`select to_regclass('public.seed_info') is not null as exists`
    if (!table!.exists) return false
    return (await sql`select 1 from public.seed_info limit 1`).length > 0
  } catch (error) {
    const code = (error as { code?: string }).code ?? ''
    if (!unreachable.includes(code) && code !== missingDatabase) throw error
    return false
  } finally {
    await sql.end()
  }
}
