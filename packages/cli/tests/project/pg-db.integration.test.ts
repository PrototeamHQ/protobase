import { randomBytes } from 'node:crypto'
import pg from 'pg'
import { sql, type Transaction } from 'kysely'
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

describe.skipIf(!reachable)('createPgDb on a transaction whose connection dropped', () => {
  const terminate = async (pid: number) => {
    const admin = new pg.Client({ connectionString: url })
    await admin.connect()
    await admin.query('select pg_terminate_backend($1)', [pid])
    await admin.end()
  }
  const backendPid = async (trx: Transaction<any>) =>
    (await sql<{ pid: number }>`select pg_backend_pid() as pid`.execute(trx)).rows[0]!.pid

  const expectTermination = async (db: ReturnType<typeof createPgDb>, error: unknown) => {
    expect((error as Error).message).toContain('terminating connection due to administrator command')
    expect((error as Error).cause).toMatchObject({ code: '57P01' })
    await expect(sql`select 1 as one`.execute(db)).resolves.toMatchObject({ rows: [{ one: 1 }] })
  }

  it('fails a statement after the drop with the reason, and queries again on a new connection', async () => {
    const print = vi.spyOn(console, 'error').mockImplementation(() => {})
    const db = createPgDb(pg, `${url}${url.includes('?') ? '&' : '?'}application_name=pg_db_tx_${randomBytes(4).toString('hex')}`, 2)
    const error = await db
      .transaction()
      .execute(async (trx) => {
        await terminate(await backendPid(trx))
        await vi.waitFor(() => expect(print).toHaveBeenCalled())
        await sql`select 1`.execute(trx)
      })
      .catch((e: unknown) => e)
    await expectTermination(db, error)
    await db.destroy()
    print.mockRestore()
  })

  it('fails a statement in flight with the reason, and queries again on a new connection', async () => {
    const print = vi.spyOn(console, 'error').mockImplementation(() => {})
    const db = createPgDb(pg, `${url}${url.includes('?') ? '&' : '?'}application_name=pg_db_tx_${randomBytes(4).toString('hex')}`, 2)
    const error = await db
      .transaction()
      .execute(async (trx) => {
        const pid = await backendPid(trx)
        await Promise.all([sql`select pg_sleep(5)`.execute(trx), terminate(pid)])
      })
      .catch((e: unknown) => e)
    await expectTermination(db, error)
    await db.destroy()
    print.mockRestore()
  })
})
