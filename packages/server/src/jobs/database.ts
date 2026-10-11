import { CompiledQuery } from 'kysely'
import type { Db as BossDb } from 'pg-boss'
import type { Db } from '@protobase/query'

// pg-boss sends maintenance and queue setup as one text: BEGIN, two SET LOCAL timeouts, an optional transaction-scoped
// advisory lock, one statement and COMMIT (`transaction()` and `locked()` in its plans.js). A driver that runs one
// statement per query (PGlite) cannot take that text, and Kysely hands back only one result.
const block = /^\s*BEGIN;\s*(SET LOCAL lock_timeout = \d+);\s*(SET LOCAL idle_in_transaction_session_timeout = \d+);\s*(SELECT pg_advisory_xact_lock\([^;]*\);\s*)?([\s\S]+?);\s*COMMIT;\s*$/

/**
 * The statements of one of pg-boss's transaction texts, in order, or `undefined` for any other text. A text that
 * starts a transaction and is not in that shape is an error, so a pg-boss upgrade that changes it fails loudly.
 */
export const transactionStatements = (text: string) => {
  if (!/^\s*BEGIN;/.test(text)) return undefined
  const match = block.exec(text)
  if (!match) throw new Error(`Unexpected pg-boss transaction:\n${text}`)
  const [, lockTimeout, idleTimeout, lock, statement] = match
  return [lockTimeout!, idleTimeout!, ...(lock ? [lock.trim().replace(/;$/, '')] : []), statement!]
}

/**
 * pg-boss's database over the app's own Kysely pool or transaction: one connection pool for the app and its jobs, the
 * same driver on Node, Bun and PGlite. Every statement runs on its own, or inside one transaction for pg-boss's
 * transaction texts, which works through a pooler in transaction mode: pg-boss takes only transaction-scoped locks.
 */
export const jobsDatabase = (db: Db): BossDb => ({
  executeSql: async (text, values) => {
    if (values && values.length > 0) return { rows: [...(await db.executeQuery(CompiledQuery.raw(text, values))).rows] }
    const statements = transactionStatements(text)
    if (!statements) return { rows: [...(await db.executeQuery(CompiledQuery.raw(text))).rows] }
    return db.transaction().execute(async (trx) => {
      let rows: unknown[] = []
      for (const statement of statements) rows = [...(await trx.executeQuery(CompiledQuery.raw(statement))).rows]
      return { rows }
    })
  },
})
