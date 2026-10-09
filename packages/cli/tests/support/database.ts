import { createServer } from 'node:net'
import { connect } from '../../src/db/connect'

// A missing database (3D000) is a run without the test template: as good as unreachable.
const unreachable = ['ECONNREFUSED', 'ENOTFOUND', 'CONNECT_TIMEOUT', 'ETIMEDOUT', '3D000']

/** The run's own clone of the ERP test template, which vitest.config.ts points DATABASE_URL at; never a developer database. */
export const testDatabaseUrl = () => {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is unset: run the tests through vitest.config.ts, which names the run\'s own database')
  return url
}

// True when the database answers; any other failure is a real error and is rethrown.
export const databaseReachable = async (url: string) => {
  const sql = connect(url, { connectTimeout: 2 })
  const ok = await sql`select 1`.then(
    () => true,
    (error: NodeJS.ErrnoException) => {
      if (unreachable.includes(error.code ?? '')) return false
      throw error
    },
  )
  await sql.end()
  return ok
}

export const freePort = () =>
  new Promise<number>((resolve) => {
    const server = createServer().listen(0, () => {
      const { port } = server.address() as { port: number }
      server.close(() => resolve(port))
    })
  })
