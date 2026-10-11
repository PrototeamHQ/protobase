import { randomBytes } from 'node:crypto'
import { Kysely, sql } from 'kysely'
import postgres from 'postgres'
import { afterAll, describe, expect, it } from 'vitest'
import { connectServer, databaseUrl, serverReachable } from '../../scripts/test-db/templates'
import { PostgresJsDialect } from '../examples/erp/kysely-postgres-js'
import { captureScenarios, raised, type TestDatabase } from './capture-scenarios'

const reachable = await serverReachable()
const id = randomBytes(4).toString('hex')
const created: string[] = []

// A database of its own on the test server, dropped after the file.
const freshDatabase = async (url = databaseUrl(`changes_${id}`)): Promise<TestDatabase> => {
  const name = new URL(url).pathname.slice(1)
  if (!created.includes(name)) {
    const server = connectServer()
    await server.unsafe(`create database "${name}"`)
    await server.end()
    created.push(name)
  }
  const client = postgres(url, { max: 2, onnotice: () => {} })
  return { db: new Kysely<any>({ dialect: new PostgresJsDialect(client) }), exec: async (text) => void (await client.unsafe(text)), close: () => client.end() }
}

afterAll(async () => {
  if (!reachable) return
  const server = connectServer()
  for (const name of created) await server.unsafe(`drop database if exists "${name}" with (force)`)
  await server.unsafe(`drop role if exists "outsider_${id}"`)
  await server.end()
})

describe.skipIf(!reachable)('change capture on Postgres', () => {
  captureScenarios(() => freshDatabase())

  // On the database the scenarios left migrated.
  it('captures the writes of a role without rights on the changes schema, as another service writes', async () => {
    const owner = await freshDatabase()
    const outsider = `outsider_${id}`
    await owner.exec(`
      create role "${outsider}" login password 'outsider';
      grant usage on schema sales to "${outsider}";
      grant select, insert, update on sales.orders to "${outsider}";
      truncate changes.outbox;`)
    const url = new URL(databaseUrl(`changes_${id}`))
    url.username = outsider
    url.password = 'outsider'
    const writer = await freshDatabase(url.toString())
    await sql`insert into sales.orders (total) values (41)`.execute(writer.db)
    await expect(sql`select count(*) from changes.outbox`.execute(writer.db)).rejects.toThrow('permission denied for schema changes')
    await writer.close()
    expect((await raised(owner.db)).map((change) => [change.events, change.actor, change.after?.total])).toEqual([[['orders.created'], null, '41']])
    await owner.exec(`drop owned by "${outsider}"`)
    await owner.close()
  })
})
