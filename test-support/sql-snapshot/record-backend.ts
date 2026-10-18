import pg from 'pg'
import { inject } from 'vitest'
import { snapshotTemplates, type SnapshotTemplateKey } from '../../scripts/test-db/snapshot-templates'
import { cloneTemplate, databaseUrl, dropDatabase } from '../../scripts/test-db/templates'
import { withRealRandomness } from './random'
import { isDatabaseError, rawError, type RawError, type RawResult } from './values'

declare module 'vitest' {
  export interface ProvidedContext {
    /** Names this `bun run test:record` run's clones, which its global setup drops. */
    snapshotRunId?: string
  }
}

export type Outcome = { result: RawResult | RawResult[] } | { error: RawError }

// Every value as Postgres sent it, so the recording keeps text and replay parses it.
const asText = { getTypeParser: () => (value: string) => value }

let opened = 0

const raw = (result: pg.QueryArrayResult): RawResult => ({
  command: result.command,
  rowCount: result.rowCount,
  // A type a schema made, such as the jobs' state enum, has an OID of the server's at the time; node-postgres parses none
  // of them, so 0, which it does not parse either, keeps the recording the same.
  columns: result.fields.map((field) => [field.name, field.dataTypeID >= 16384 ? 0 : field.dataTypeID]),
  rows: result.rows as (string | null)[][],
})

const cloneName = () => `snapshot_${inject('snapshotRunId')}_${process.env.VITEST_POOL_ID ?? 0}_${process.pid}_${++opened}`

/** One connection to a clone this run made, for `bun run test:record`. */
export type Backend = {
  run: (sql: string, params: (string | Buffer | null)[] | undefined) => Promise<Outcome>
  /** Which of `candidates` are the OIDs of objects in the database, by a query the recording leaves out. */
  existingOids: (candidates: string[]) => Promise<string[]>
  clone: () => Promise<Backend>
  close: () => Promise<void>
}

const connectBackend = async (database: string): Promise<Backend> => {
  const connect = () =>
    withRealRandomness(async () => {
      const client = new pg.Client({ connectionString: databaseUrl(database), types: asText, connectionTimeoutMillis: 15_000 })
      await client.connect()
      return client
    })
  let client = await connect()

  const run: Backend['run'] = async (sql, params) => {
    try {
      const result = (await client.query({ text: sql, values: params, rowMode: 'array' })) as pg.QueryArrayResult | pg.QueryArrayResult[]
      return { result: Array.isArray(result) ? result.map(raw) : raw(result) }
    } catch (error) {
      if (isDatabaseError(error)) return { error: rawError(error) }
      throw error
    }
  }

  const existingOids: Backend['existingOids'] = async (candidates) => {
    if (!candidates.length) return []
    const { rows } = await client.query<{ oid: string }>({
      text: `select oid::text from unnest($1::oid[]) as oid where exists (select from pg_class where pg_class.oid = oid)
        or exists (select from pg_proc where pg_proc.oid = oid) or exists (select from pg_type where pg_type.oid = oid)
        or exists (select from pg_trigger where pg_trigger.oid = oid) or exists (select from pg_namespace where pg_namespace.oid = oid)
        or exists (select from pg_constraint where pg_constraint.oid = oid)`,
      values: [`{${candidates.join(',')}}`],
    })
    return rows.map((row) => row.oid)
  }

  /** A copy of the database as it is now; Postgres copies a database only while nothing is connected to it. */
  const clone = async () => {
    await client.end()
    const copy = cloneName()
    await withRealRandomness(() => cloneTemplate({ database, strategy: 'wal_log' }, copy))
    client = await connect()
    return connectBackend(copy)
  }

  const close = async () => {
    await client.end()
    await withRealRandomness(() => dropDatabase(database))
  }

  return { run, existingOids, clone, close }
}

/** A clone of the template on the real Postgres server, with one connection, for `bun run test:record`. */
export const openRecordBackend = async (key: SnapshotTemplateKey) => {
  const database = cloneName()
  await withRealRandomness(() => cloneTemplate(snapshotTemplates[key], database))
  return connectBackend(database)
}
