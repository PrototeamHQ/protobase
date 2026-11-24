import { randomBytes } from 'node:crypto'
import { Kysely, PostgresDialect } from 'kysely'
import pg from 'pg'
import postgres from 'postgres'
import { afterAll, beforeAll } from 'vitest'
import { jobsSchemaMigration } from '@protobase/server'
import { connectServer, databaseUrl } from '../../scripts/test-db/templates'

/**
 * A database of the file's own with the jobs schema, created before its tests and dropped after them; it returns the
 * database's name.
 */
export const useJobsDatabase = () => {
  const database = `jobs_run_${randomBytes(4).toString('hex')}`

  beforeAll(async () => {
    const admin = connectServer()
    await admin.unsafe(`create database "${database}"`)
    await admin.end()
    // As a project's db:migrate applies the file `protobase migration` writes: one transaction, through postgres.js.
    const db = new Kysely<any>({ dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: databaseUrl(database), max: 1 }) }) })
    const migration = (await jobsSchemaMigration(db))!
    await db.destroy()
    const migrate = postgres(databaseUrl(database), { max: 1, onnotice: () => {} })
    await migrate.begin((tx) => tx.unsafe(migration))
    await migrate.end()
  })

  afterAll(async () => {
    const admin = connectServer()
    await admin.unsafe(`drop database if exists "${database}" with (force)`)
    await admin.end()
  })

  return database
}
