import { randomBytes } from 'node:crypto'
import pg from 'pg'
import { sql } from 'kysely'
import { describe, expect, it, vi } from 'vitest'
import { createPgDb } from '../../src/project/pg-db'
import { databaseReachable, testDatabaseUrl } from '../support/database'

const url = testDatabaseUrl()
const reachable = await databaseReachable(url)

describe.skipIf(!reachable)('createPgDb on a dropped connection', () => {
  it('prints the drop, keeps running and queries again on a new connection', async () => {
    const applicationName = `pg_db_drop_${randomBytes(4).toString('hex')}`
    const print = vi.spyOn(console, 'error').mockImplementation(() => {})
    const db = createPgDb(pg, `${url}${url.includes('?') ? '&' : '?'}application_name=${applicationName}`, 2)
    await sql`select 1`.execute(db)

    const admin = new pg.Client({ connectionString: url })
    await admin.connect()
    await admin.query('select pg_terminate_backend(pid) from pg_stat_activity where application_name = $1', [applicationName])
    await admin.end()

    await vi.waitFor(() => expect(print).toHaveBeenCalled())
    await expect(sql`select 1 as one`.execute(db)).resolves.toBeDefined()
    await db.destroy()
    print.mockRestore()
  })
})
