import pg from 'pg'
import { inject } from 'vitest'
import { snapshotTemplates, type SnapshotTemplateKey } from '../../scripts/test-db/snapshot-templates'
import { cloneTemplate, databaseUrl, dropDatabase } from '../../scripts/test-db/templates'
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
  columns: result.fields.map((field) => [field.name, field.dataTypeID]),
  rows: result.rows as (string | null)[][],
})

/** A clone of the template on the real Postgres server, with one connection, for `bun run test:record`. */
export const openRecordBackend = async (key: SnapshotTemplateKey) => {
  const template = snapshotTemplates[key]
  const database = `snapshot_${inject('snapshotRunId')}_${process.env.VITEST_POOL_ID ?? 0}_${process.pid}_${++opened}`
  await cloneTemplate(template, database)
  const client = new pg.Client({ connectionString: databaseUrl(database), types: asText })
  await client.connect()

  const run = async (sql: string, params: (string | Buffer | null)[] | undefined): Promise<Outcome> => {
    try {
      const result = (await client.query({ text: sql, values: params, rowMode: 'array' })) as pg.QueryArrayResult | pg.QueryArrayResult[]
      return { result: Array.isArray(result) ? result.map(raw) : raw(result) }
    } catch (error) {
      if (isDatabaseError(error)) return { error: rawError(error) }
      throw error
    }
  }

  const close = async () => {
    await client.end()
    await dropDatabase(database)
  }

  return { run, close }
}
