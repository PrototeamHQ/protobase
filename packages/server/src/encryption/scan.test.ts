import { Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler, sql, type DatabaseConnection, type Driver } from 'kysely'
import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { buildRegistry } from '../registry'
import { scanColumn } from './scan'

// A database on one connection that records each statement and answers fetches from `batches`.
const recorder = (batches: Record<string, unknown>[][]) => {
  const statements: string[] = []
  const connection: DatabaseConnection = {
    executeQuery: async (query) => {
      const text = query.sql.replace(/\s+/g, ' ').trim()
      statements.push(text.split(' ').slice(0, 2).join(' '))
      return { rows: (text.startsWith('fetch') ? batches.shift() ?? [] : []) as never[], numAffectedRows: 1n }
    },
    streamQuery: () => {
      throw new Error('Not implemented: the scan streams nothing')
    },
  }
  const driver: Driver = {
    init: async () => {},
    acquireConnection: async () => connection,
    beginTransaction: async () => void statements.push('begin (trx)'),
    commitTransaction: async () => void statements.push('commit (trx)'),
    rollbackTransaction: async () => void statements.push('rollback (trx)'),
    releaseConnection: async () => {},
    destroy: async () => {},
  }
  const db = new Kysely<any>({
    dialect: { createAdapter: () => new PostgresAdapter(), createDriver: () => driver, createIntrospector: (k) => new PostgresIntrospector(k), createQueryCompiler: () => new PostgresQueryCompiler() },
  })
  return { db, statements }
}

const people = resource('people').table('people').fields({ id: f.bigint(), org: f.text(), iban: f.text().encrypted() }).primaryKey((r) => r.id).tenant((r) => r.org)
const entry = buildRegistry([people]).entries[0]!
const field = entry.model.fields.iban!
const row = { id: 9007199254740993n, org: 'a', iban: 'NL91', __pb_key_0: '9007199254740993', __pb_tenant: 'a' }

describe('scanColumn', () => {
  it('declares a holdable cursor, fetches outside a transaction, writes each batch on the same connection, and closes it', async () => {
    const { db, statements } = recorder([[row], [row]])
    const seen: unknown[] = []
    await scanColumn(db, entry, field, async (rows, connection) => {
      seen.push(...rows)
      await connection.transaction().execute((trx) => sql`update people set iban = 'x'`.execute(trx))
    })
    expect(statements).toEqual(['begin', 'declare "pb_encryption_scan"', 'commit', 'fetch 500', 'begin (trx)', 'update people', 'commit (trx)', 'fetch 500', 'begin (trx)', 'update people', 'commit (trx)', 'fetch 500', 'rollback', 'close "pb_encryption_scan"'])
    expect(seen[0]).toEqual({ record: { id: '9007199254740993', org: 'a', iban: 'NL91' }, address: { key: ['9007199254740993'], tenant: 'a' }, stored: 'NL91' })
  })

  it('rolls back and closes the cursor when a batch throws, and passes the error on', async () => {
    const { db, statements } = recorder([[row]])
    await expect(scanColumn(db, entry, field, async () => {
      throw new Error('boom')
    })).rejects.toThrow('boom')
    expect(statements.slice(-2)).toEqual(['rollback', 'close "pb_encryption_scan"'])
  })
})
