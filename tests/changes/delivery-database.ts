import { randomBytes } from 'node:crypto'
import { Kysely, PostgresDialect } from 'kysely'
import pg from 'pg'
import { afterAll } from 'vitest'
import { connectServer, databaseUrl } from '../../scripts/test-db/templates'
import type { TestDatabase } from './capture-scenarios'

/**
 * Databases of the file's own, reached directly or through `server`, such as PgBouncer in transaction mode as the cloud
 * runs it: each call of the function it returns creates one, and all are dropped after the file's tests.
 */
export const freshDeliveryDatabases = (server?: string) => {
  const id = randomBytes(4).toString('hex')
  const created: string[] = []

  afterAll(async () => {
    if (created.length === 0) return
    const admin = connectServer()
    for (const name of created) await admin.unsafe(`drop database if exists "${name}" with (force)`)
    await admin.end()
  })

  return async (): Promise<TestDatabase> => {
    const name = `delivery_${id}_${created.length}`
    const admin = connectServer()
    await admin.unsafe(`create database "${name}"`)
    await admin.end()
    created.push(name)
    const pool = new pg.Pool({ connectionString: databaseUrl(name, server), max: 3 })
    return { db: new Kysely<any>({ dialect: new PostgresDialect({ pool }) }), exec: async (text: string) => void (await pool.query(text)), close: () => pool.end() }
  }
}
