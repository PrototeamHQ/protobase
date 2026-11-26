import { sql, type Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { captureSchemaSql, createAdmin } from '@protobase/server'
import { openPostgresDatabase, postgresTemplateReady, statementTimeoutMs, type PostgresDatabase } from '../../test-support/postgres-database'

// The logical messages a reader of the WAL maps changes by, read back from the WAL itself with pg_walinspect, which
// needs no logical replication: the test server runs at the default wal_level. Other databases on the server write
// WAL too, so each check follows the records of one transaction, found by its message.

const orders = resource('orders').table('orders').fields({ id: f.integer().readOnly(), status: f.text() }).primaryKey((r) => r.id)

type WalRecord = { xid: string; resource_manager: string; record_type: string; description: string }
type Message = { xid: string; prefix: string; content: unknown }

// A message record's description: `transactional, prefix "<prefix>"; payload (<n> bytes): 7B 22 ...`.
const messageOf = (record: WalRecord): Message | undefined => {
  const found = /^transactional, prefix "([^"]+)"; payload \(\d+ bytes\): ([0-9A-F ]+)$/.exec(record.description)
  if (!found) return
  const bytes = Uint8Array.from(found[2]!.trim().split(' '), (pair) => parseInt(pair, 16))
  return { xid: record.xid, prefix: found[1]!, content: JSON.parse(new TextDecoder().decode(bytes)) }
}

describe.skipIf(!(await postgresTemplateReady('jobs')))('the change stream messages on Postgres', () => {
  let pg: PostgresDatabase
  let db: Kysely<any>
  let admin: ReturnType<typeof createAdmin>
  // A user id no other database's writes name.
  const writer = `writer-${crypto.randomUUID()}`

  beforeAll(async () => {
    pg = await openPostgresDatabase('jobs')
    db = pg.db
    await pg.exec('create extension if not exists pg_walinspect')
    await pg.exec('create table orders (id integer generated always as identity primary key, status text not null)')
    await pg.exec(captureSchemaSql([orders.toModel()], { stream: true }))
    admin = createAdmin({ resources: [orders], db, authenticate: () => ({ user: { id: writer, roles: ['admin'] } }), options: { statementTimeoutMs } })
  })

  afterAll(async () => {
    await pg?.close()
  })

  const walSince = async (start: string) =>
    (await sql<WalRecord>`select xid::text as xid, resource_manager, record_type, description from pg_get_wal_records_info(${start}::pg_lsn, 'FFFFFFFF/FFFFFFFF'::pg_lsn) order by start_lsn`.execute(db)).rows
  const currentLsn = async () => (await sql<{ lsn: string }>`select pg_current_wal_insert_lsn()::text as lsn`.execute(db)).rows[0]!.lsn
  // The records of the transaction whose message `pick` finds, as `<manager> <type>`, its messages by prefix.
  const transactionOf = (records: WalRecord[], pick: (message: Message) => boolean) => {
    const message = records.map(messageOf).find((found) => found && pick(found))
    if (!message) throw new Error('No such message in the WAL')
    const own = records.filter((record) => record.xid === message.xid)
    return { kinds: own.map((record) => `${record.resource_manager} ${record.record_type}`), messages: own.flatMap((record) => messageOf(record) ?? []) }
  }

  it("emits the writer's protobase_actor message in the write's transaction, before its rows", async () => {
    const start = await currentLsn()
    const response = await admin.request('/api/v1/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'open' }) })
    expect(response.status).toBe(201)
    const { kinds, messages } = transactionOf(await walSince(start), (message) => message.prefix === 'protobase_actor' && JSON.stringify(message.content).includes(writer))
    expect(messages).toEqual([expect.objectContaining({ prefix: 'protobase_actor', content: { id: writer, roles: ['admin'] } })])
    // The row's insert is `INSERT` or, on a new page, `INSERT+INIT`.
    const inserted = kinds.findIndex((kind) => kind.startsWith('Heap INSERT'))
    expect(kinds.indexOf('LogicalMessage MESSAGE')).toBeLessThan(inserted)
    expect(inserted).toBeGreaterThan(-1)
    expect(kinds.at(-1)).toBe('Transaction COMMIT')
  })

  it('emits a protobase_ddl message for each command a schema change runs and a protobase_drop one for each object it drops', async () => {
    const start = await currentLsn()
    await pg.exec('alter table orders add column note text')
    await pg.exec('create table scratch (id integer primary key)')
    await pg.exec('drop table scratch')
    const records = await walSince(start)
    const altered = transactionOf(records, (message) => message.prefix === 'protobase_ddl' && (message.content as { object_identity: string }).object_identity === 'public.orders')
    expect(altered.messages.map((message) => message.content)).toEqual([{ command_tag: 'ALTER TABLE', object_type: 'table', schema_name: 'public', object_identity: 'public.orders' }])
    expect(altered.kinds.at(-1)).toBe('Transaction COMMIT')
    const dropped = transactionOf(records, (message) => message.prefix === 'protobase_drop' && (message.content as { object_identity: string }).object_identity === 'public.scratch')
    expect(dropped.messages.map((message) => message.content)).toContainEqual({ object_type: 'table', schema_name: 'public', object_identity: 'public.scratch' })
    expect(dropped.messages.every((message) => message.prefix === 'protobase_drop')).toBe(true)
  })
})
