import { sql } from 'kysely'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { QueryError } from '../src/errors'
import { createTestDb } from '../../../test-support/query'
import { withStatementTimeout } from '../src/with-statement-timeout'

let ctx: Awaited<ReturnType<typeof createTestDb>>
beforeAll(async () => { ctx = await createTestDb({ seed: false }) })
afterAll(async () => { await ctx.db.destroy() })

it('lets fast statements finish and does not leak the setting', async () => {
  const result = await withStatementTimeout(ctx.db, 5000, trx => sql<{ v: string }>`select current_setting('statement_timeout') as v`.execute(trx))
  expect(result.rows[0]?.v).toBe('5s')
  const after = await sql<{ v: string }>`select current_setting('statement_timeout') as v`.execute(ctx.db)
  expect(after.rows[0]?.v).toBe('0')
})

it('rejects non-positive timeouts', async () => {
  await expect(withStatementTimeout(ctx.db, 0, async () => 1)).rejects.toBeInstanceOf(QueryError)
})

it('runs inside an existing transaction and restores the previous timeout', async () => {
  await ctx.db.transaction().execute(async trx => {
    const inside = await withStatementTimeout(trx, 7000, t => sql<{ v: string }>`select current_setting('statement_timeout') as v`.execute(t))
    expect(inside.rows[0]?.v).toBe('7s')
    const after = await sql<{ v: string }>`select current_setting('statement_timeout') as v`.execute(trx)
    expect(after.rows[0]?.v).toBe('0')
  })
})

it('reports the failing statement, not the aborted transaction, inside an existing transaction', async () => {
  const failing = ctx.db.transaction().execute(trx => withStatementTimeout(trx, 7000, t => sql`select 'not a number'::integer`.execute(t)))
  await expect(failing).rejects.toMatchObject({ code: '22P02' })
})

it('restores the timeout after a non-SQL failure, leaving the transaction usable', async () => {
  await ctx.db.transaction().execute(async trx => {
    await expect(withStatementTimeout(trx, 7000, async () => { throw new Error('boom') })).rejects.toThrow('boom')
    const after = await sql<{ v: string }>`select current_setting('statement_timeout') as v`.execute(trx)
    expect(after.rows[0]?.v).toBe('0')
  })
})
