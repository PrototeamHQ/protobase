import { isDeepStrictEqual } from 'node:util'
import { Kysely, PostgresDialect } from 'kysely'
import { onTestFinished, TestRunner } from 'vitest'
import type { SnapshotTemplateKey } from '../../scripts/test-db/snapshot-templates'
import { fileContext, nextHandle } from './context'
import { createLock } from './lock'
import { currentScope, recording, staleSnapshot } from './mode'
import type { Entry } from './recording'
import { openRecordBackend, type Outcome } from './record-backend'
import { decodeTimes } from './server-times'
import { databaseError, parseResult, prepareParams, sendable, type ParsedResult, type RawParam, type RawResult } from './values'

const shorten = (text: string) => (text.length > 300 ? `${text.slice(0, 300)}...` : text)

const decodeResult = (result: RawResult): RawResult => ({ ...result, rows: result.rows.map((row) => row.map((value) => (value === null ? null : decodeTimes(value)))) })

/** What the app gets back: node-postgres's result, or the error it throws. */
const answer = (outcome: Outcome) => {
  if ('error' in outcome) throw databaseError({ ...outcome.error, message: decodeTimes(outcome.error.message) })
  return Array.isArray(outcome.result) ? outcome.result.map((one) => parseResult(decodeResult(one))) : parseResult(decodeResult(outcome.result))
}

/**
 * A database for one test file's snapshot tests, with one connection like PGlite's. Under `bun run test:record` it is a
 * clone of the template on real Postgres, and each query and its answer are appended to the file's recording; in a
 * normal run it connects to nothing and answers each query from the recording, failing on any query that differs.
 */
export const openSnapshotDb = async (template: SnapshotTemplateKey) => {
  const context = fileContext()
  const handle = nextHandle(currentScope())
  const backend = recording ? await openRecordBackend(template) : undefined
  const lock = createLock()

  const recorded = async (sql: string, params: RawParam[] | undefined): Promise<Outcome> => {
    const scope = currentScope()
    const { entry, at } = context.recording.next(scope, handle)
    const where = `${context.recording.name}, "${scope}", database ${handle}, query ${at + 1}`
    if (!context.recording.exists) throw staleSnapshot(`${context.recording.name} does not exist.`)
    if (!entry) throw staleSnapshot(`${where} was not recorded: ${shorten(sql)}`)
    const expected = entry.params?.map((param) => (typeof param === 'string' ? decodeTimes(param) : param))
    if (entry.sql !== sql) throw staleSnapshot(`${where} differs.\nrecorded: ${shorten(entry.sql)}\nnow:      ${shorten(sql)}`)
    if (!isDeepStrictEqual(expected, params)) throw staleSnapshot(`${where} has other params.\nrecorded: ${shorten(JSON.stringify(expected))}\nnow:      ${shorten(JSON.stringify(params))}`)
    // A beat, as a round trip to Postgres takes, so concurrent work interleaves as it did when recording.
    await new Promise((resolve) => setImmediate(resolve))
    return entry as Outcome
  }

  const record = async (sql: string, params: RawParam[] | undefined): Promise<Outcome> => {
    const encoded = params?.map((param) => (typeof param === 'string' ? context.times.encodeParam(param) : { real: param, kept: param }))
    const outcome = await backend!.run(sql, encoded?.map(({ real }) => sendable(real)))
    const entry: Entry = { sql, ...(encoded && { params: encoded.map(({ kept }) => kept) }) }
    if ('error' in outcome) {
      entry.error = outcome.error
    } else {
      const results = Array.isArray(outcome.result) ? outcome.result : [outcome.result]
      const encode = context.times.encodeResult(results.flatMap((result) => result.rows.flat().filter((value) => value !== null)))
      const kept = results.map((result) => ({ ...result, rows: result.rows.map((row) => row.map((value) => (value === null ? null : encode(value)))) }))
      entry.result = Array.isArray(outcome.result) ? kept : kept[0]
    }
    context.recording.append(currentScope(), handle, entry)
    return entry as Outcome
  }

  /** One query, as node-postgres's `client.query` takes it; the caller holds the lock. */
  const run = async (sql: string, values?: readonly unknown[]) => {
    const params = values?.length ? prepareParams(values) : undefined
    return answer(await (recording ? record : recorded)(sql, params))
  }

  const held = async <T>(work: () => Promise<T>) => {
    const release = await lock.acquire()
    try {
      return await work()
    } finally {
      release()
    }
  }

  // A pool of the one connection, for Kysely's own Postgres driver: transactions and savepoints run the SQL they do in
  // production. Ending it is the test's business, not the app's, so `end` leaves it open.
  const client = { query: run, release: () => {} }
  const pool = {
    connect: async () => {
      const release = await lock.acquire()
      return { ...client, release }
    },
    end: async () => {},
    options: {},
  }
  const dialect = new PostgresDialect({ pool: pool as never })

  /** PGlite's `query`: one statement, with params. */
  const query = <T = any>(sql: string, params?: readonly unknown[]) =>
    held(async () => {
      const result = (await run(sql, params ?? [])) as ParsedResult
      return { rows: result.rows as T[], fields: result.fields, affectedRows: result.rowCount ?? 0 }
    })

  /** PGlite's `exec`: any number of statements, without params. */
  const exec = (sql: string) =>
    held(async () => {
      const result = await run(sql)
      return (Array.isArray(result) ? result : [result]).map((one) => ({ rows: one.rows, fields: one.fields, affectedRows: one.rowCount ?? 0 }))
    })

  let closed = false
  const close = async () => {
    if (closed) return
    closed = true
    await backend?.close()
  }
  if (TestRunner.getCurrentTest()) onTestFinished(close)
  else context.closeAtEnd.push(close)

  return { db: new Kysely<any>({ dialect }), dialect, query, exec, close }
}

export type SnapshotDb = Awaited<ReturnType<typeof openSnapshotDb>>
