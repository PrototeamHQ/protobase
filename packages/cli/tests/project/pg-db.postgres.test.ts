import pg from 'pg'
import { sql, type Transaction } from 'kysely'
import { describe, expect, it, vi, type MockInstance } from 'vitest'
import { createPgDb } from '../../src/project/pg-db'
import { openPostgresDatabase, postgresTemplateReady } from '../../../../test-support/postgres-database'

const administratorCommand = 'terminating connection due to administrator command'

// A transaction holds one connection of the app's pool while another connection terminates its backend.
describe.skipIf(!(await postgresTemplateReady('empty')))('createPgDb on a transaction whose connection dropped, on Postgres', () => {
  const withAdmin = async <T>(url: string, use: (admin: pg.Client) => Promise<T>) => {
    const admin = new pg.Client({ connectionString: url })
    await admin.connect()
    try {
      return await use(admin)
    } finally {
      await admin.end()
    }
  }
  const terminate = (url: string, pid: number) => withAdmin(url, (admin) => admin.query('select pg_terminate_backend($1)', [pid]))
  // Until the backend `pid` runs `pg_sleep`, so the termination meets a statement in flight
  const sleeping = (url: string, pid: number) =>
    withAdmin(url, async (admin) => {
      for (let tries = 0; tries < 200; tries++) {
        const { rows } = await admin.query(`select 1 from pg_stat_activity where pid = $1 and state = 'active' and query like 'select pg_sleep%'`, [pid])
        if (rows.length) return
        await new Promise((resolve) => setTimeout(resolve, 25))
      }
      throw new Error(`Backend ${pid} never started its pg_sleep`)
    })
  const backendPid = async (trx: Transaction<any>) =>
    (await sql<{ pid: number }>`select pg_backend_pid() as pid`.execute(trx)).rows[0]!.pid

  // The app's Kysely on a clone, with its drop prints silenced; the pools close and the spy is restored however the test ends.
  const withApp = async (use: (db: ReturnType<typeof createPgDb>, url: string, print: MockInstance) => Promise<void>) => {
    const { url } = await openPostgresDatabase('empty')
    const print = vi.spyOn(console, 'error').mockImplementation(() => {})
    const db = createPgDb(pg, url, 2)
    try {
      await use(db, url, print)
    } finally {
      try {
        await db.destroy()
      } finally {
        print.mockRestore()
      }
    }
  }

  const expectTermination = async (db: ReturnType<typeof createPgDb>, error: unknown) => {
    expect((error as Error).message).toContain(administratorCommand)
    expect((error as Error).cause).toMatchObject({ code: '57P01' })
    await expect(sql`select 1 as one`.execute(db)).resolves.toMatchObject({ rows: [{ one: 1 }] })
  }

  it('fails a statement after the drop with the reason, and queries again on a new connection', () =>
    withApp(async (db, url, print) => {
      const error = await db
        .transaction()
        .execute(async (trx) => {
          await terminate(url, await backendPid(trx))
          // The transaction's client reports its drop with the termination's own message.
          await vi.waitFor(() => expect(print).toHaveBeenCalledWith(expect.stringContaining(administratorCommand)))
          await sql`select 1`.execute(trx)
        })
        .catch((e: unknown) => e)
      await expectTermination(db, error)
    }))

  it('fails a statement in flight with the reason, and queries again on a new connection', () =>
    withApp(async (db, url) => {
      const error = await db
        .transaction()
        .execute(async (trx) => {
          const pid = await backendPid(trx)
          await Promise.all([sql`select pg_sleep(5)`.execute(trx), sleeping(url, pid).then(() => terminate(url, pid))])
        })
        .catch((e: unknown) => e)
      await expectTermination(db, error)
    }))
})
