import { randomBytes } from 'node:crypto'
import { Kysely, PostgresDialect } from 'kysely'
import pg from 'pg'
import { afterAll, describe, vi } from 'vitest'
import { connectServer, databaseUrl, serverReachable } from '../../scripts/test-db/templates'
import { historyScenarios } from './history-scenarios'

// Workers poll on real timers, which a busy machine stretches.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const reachable = await serverReachable()
const name = `history_${randomBytes(4).toString('hex')}`

afterAll(async () => {
  if (!reachable) return
  const server = connectServer()
  await server.unsafe(`drop database if exists "${name}" with (force)`)
  await server.end()
})

describe.skipIf(!reachable)('record history on Postgres', () => {
  historyScenarios(async () => {
    const admin = connectServer()
    await admin.unsafe(`create database "${name}"`)
    await admin.end()
    const pool = new pg.Pool({ connectionString: databaseUrl(name), max: 3 })
    return { db: new Kysely<any>({ dialect: new PostgresDialect({ pool }) }), exec: async (text: string) => void (await pool.query(text)), close: () => pool.end() }
  }, { roles: true })
})
