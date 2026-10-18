import { isDeepStrictEqual } from 'node:util'
import { Kysely, PostgresDialect } from 'kysely'
import { onTestFinished, TestRunner } from 'vitest'
import type { SnapshotTemplateKey } from '../../scripts/test-db/snapshot-templates'
import { fileContext, nextHandle } from './context'
import { track } from './activity'
import { createLock } from './lock'
import { currentScope, recording } from './mode'
import type { Entry } from './recording'
import { openRecordBackend, type Backend, type Outcome } from './record-backend'
import { readsCatalog, oidCandidates } from './server-oids'
import { decodeServerValues } from './server-values'
import { databaseError, parseResult, prepareParams, sendable, type ParsedResult, type RawError, type RawParam, type RawResult } from './values'

const shorten = (text: string) => (text.length > 300 ? `${text.slice(0, 300)}...` : text)

const decodeResult = (result: RawResult): RawResult => ({ ...result, rows: result.rows.map((row) => row.map((value) => (value === null ? null : decodeServerValues(value)))) })

/** What the app gets back: node-postgres's result, or the error it throws. */
const answer = (outcome: Outcome) => {
  if ('error' in outcome) throw databaseError(Object.fromEntries(Object.entries(outcome.error).map(([field, value]) => [field, decodeServerValues(value)])) as RawError)
  return Array.isArray(outcome.result) ? outcome.result.map((one) => parseResult(decodeResult(one))) : parseResult(decodeResult(outcome.result))
}

/**
 * A database for one test file's snapshot tests, with one connection like PGlite's. Under `bun run test:record` it is a
 * clone of the template on real Postgres, and each query and its answer are appended to the file's recording; in a
 * normal run it connects to nothing and answers each query from the recording, failing on any query that differs.
 */
export const openSnapshotDb = (template: SnapshotTemplateKey) => openHandle(recording ? openRecordBackend(template) : undefined)

type Fields = ParsedResult['fields']

/** A snapshot database: Kysely over it, and PGlite's `query`, `exec` and `clone` for the tests' own SQL. */
export type SnapshotDb = {
  db: Kysely<any>
  dialect: PostgresDialect
  query: <T = any>(sql: string, params?: readonly unknown[]) => Promise<{ rows: T[]; fields: Fields; affectedRows: number }>
  exec: (sql: string) => Promise<{ rows: Record<string, unknown>[]; fields: Fields; affectedRows: number }[]>
  clone: () => Promise<SnapshotDb>
  close: () => Promise<void>
}

const openHandle = async (opening: Promise<Backend> | undefined): Promise<SnapshotDb> => {
  const context = fileContext()
  const handle = nextHandle(currentScope())
  const backend = await opening
  const lock = createLock()

  const decodeParams = (entry: Entry) => entry.params?.map((param) => (typeof param === 'string' ? decodeServerValues(param) : param))

  const recorded = async (sql: string, params: RawParam[] | undefined): Promise<Outcome> => {
    const scope = currentScope()
    if (!context.recording.exists) throw context.stale(`${context.recording.name} does not exist.`)
    const { entry, at, expected } = context.recording.take(scope, handle, (one) => one.sql === sql && isDeepStrictEqual(decodeParams(one), params))
    const where = `${context.recording.name}, "${scope}", database ${handle}, query ${at + 1}`
    if (!entry && !expected) throw context.stale(`${where} was not recorded: ${shorten(sql)}`)
    if (!entry && expected!.sql !== sql) throw context.stale(`${where} differs.\nrecorded: ${shorten(expected!.sql)}\nnow:      ${shorten(sql)}`)
    if (!entry) throw context.stale(`${where} has other params.\nrecorded: ${shorten(JSON.stringify(decodeParams(expected!)))}\nnow:      ${shorten(JSON.stringify(params))}`)
    // A beat, as a round trip to Postgres takes, so concurrent work interleaves as it did when recording.
    await new Promise((resolve) => setImmediate(resolve))
    return entry as Outcome
  }

  const record = async (sql: string, params: RawParam[] | undefined): Promise<Outcome> => {
    const encoded = params?.map((param) => (typeof param === 'string' ? context.values.encodeParam(param) : { real: param, kept: param }))
    const outcome = await backend!.run(sql, encoded?.map(({ real }) => sendable(real)))
    const entry: Entry = { sql, ...(encoded && { params: encoded.map(({ kept }) => kept) }) }
    if ('error' in outcome) {
      const texts = Object.values(outcome.error).filter((value): value is string => typeof value === 'string')
      const encode = context.values.encodeResult(texts)
      entry.error = Object.fromEntries(Object.entries(outcome.error).map(([field, value]) => [field, typeof value === 'string' ? encode(value) : value])) as RawError
    } else {
      const results = Array.isArray(outcome.result) ? outcome.result : [outcome.result]
      if (readsCatalog(sql)) context.values.learnOids(await backend!.existingOids(oidCandidates(results)))
      const encode = context.values.encodeResult(results.flatMap((result) => result.rows.flat().filter((value) => value !== null)))
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

  const held = <T>(work: () => Promise<T>) =>
    track(async () => {
      const release = await lock.acquire()
      try {
        return await work()
      } finally {
        release()
      }
    })

  // A pool of the one connection, for Kysely's own Postgres driver: transactions and savepoints run the SQL they do in
  // production. Ending it is the test's business, not the app's, so `end` leaves it open.
  const pool = {
    connect: async () => {
      let done!: () => void
      void track(() => new Promise<void>((resolve) => (done = resolve)))
      const release = await lock.acquire()
      return {
        query: run,
        release: () => {
          release()
          done()
        },
      }
    },
    end: async () => {},
    options: {},
  }
  const dialect = new PostgresDialect({ pool: pool as never })

  /** PGlite's `query`: one statement, with params. */
  const query: SnapshotDb['query'] = <T,>(sql: string, params?: readonly unknown[]) =>
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

  /** A copy of this database as it is now, as PGlite's `clone` makes one; closed with the test that made it, if any. */
  const clone = () => held(() => openHandle(backend?.clone()))

  return { db: new Kysely<any>({ dialect }), dialect, query, exec, clone, close }
}

