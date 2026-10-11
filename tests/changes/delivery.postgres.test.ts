import { randomBytes } from 'node:crypto'
import { Kysely, PostgresDialect } from 'kysely'
import pg from 'pg'
import { afterAll, describe, vi } from 'vitest'
import { connectServer, databaseUrl, poolerUrl, serverReachable } from '../../scripts/test-db/templates'
import { deliveryScenarios } from './delivery-scenarios'

// Workers poll and retry on real timers, which a busy machine stretches.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const reachable = await serverReachable()
const id = randomBytes(4).toString('hex')
const created: string[] = []

const poolerReachable = async () => {
  const pool = new pg.Pool({ connectionString: databaseUrl('postgres', poolerUrl), max: 1, connectionTimeoutMillis: 2_000 })
  const ok = await pool.query('select 1').then(() => true, () => false)
  await pool.end()
  return ok
}

afterAll(async () => {
  if (!reachable) return
  const server = connectServer()
  for (const name of created) await server.unsafe(`drop database if exists "${name}" with (force)`)
  await server.end()
})

// A database of its own, reached directly or through PgBouncer in transaction mode as the cloud runs it: the actor
// setting, the dispatch job the trigger enqueues and the delivery jobs all go through the pooler.
const freshDatabase = (server?: string) => async () => {
  const name = `delivery_${id}_${created.length}`
  const admin = connectServer()
  await admin.unsafe(`create database "${name}"`)
  await admin.end()
  created.push(name)
  const pool = new pg.Pool({ connectionString: databaseUrl(name, server), max: 3 })
  return { db: new Kysely<any>({ dialect: new PostgresDialect({ pool }) }), exec: async (text: string) => void (await pool.query(text)), close: () => pool.end() }
}

describe.skipIf(!reachable)('event delivery on Postgres', () => {
  deliveryScenarios(freshDatabase())
})

describe.skipIf(!reachable || !(await poolerReachable()))('event delivery through PgBouncer in transaction mode', () => {
  deliveryScenarios(freshDatabase(poolerUrl))
})
