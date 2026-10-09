import { connect } from '../../../examples/erp/db/connection'

// Tests run against the database vitest.config.ts clones for the run; without DATABASE_URL, connection.ts would
// fall back to the developer database.
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is unset: run the tests through vitest.config.ts, which names the run\'s own database')

// A missing database (3D000) is a run without the test template: as good as unreachable.
const unreachable = ['ECONNREFUSED', 'ENOTFOUND', 'CONNECT_TIMEOUT', 'CONNECTION_CLOSED', '3D000']

// True when the database answers; any other failure is a real error and is rethrown.
export const databaseReachable = async () => {
  const sql = connect({ max: 1, connect_timeout: 2 })
  try {
    await sql`select 1`
    return true
  } catch (error) {
    if (!unreachable.includes((error as { code?: string }).code ?? '')) throw error
    return false
  } finally {
    await sql.end()
  }
}
