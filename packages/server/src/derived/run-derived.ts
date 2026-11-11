import type { Db } from '@protobase/query'
import type { ResourceModel } from '@protobase/schema'
import type { Scalar } from './condition'
import { namedRead, resourceReads, type RecordedRead } from './recorded-reads'
import { statementReads, type TableRead } from './sql-reads'
import { trackedClock, type DerivedClock } from './tracked-clock'

/** What a derived value's compute function gets beside the record's key. */
export type DerivedContext = {
  /**
   * The app's database, in a read-only transaction. Each query it sends is analysed for the tables and rows it reads,
   * however it was built.
   */
  db: Db
  /** The time, whose checks record when their answers flip. */
  clock: DerivedClock
  /**
   * Names a dependency itself, beside the queries' or instead of them: every record of `resource`, or those whose
   * fields hold these values (a list for any of several).
   */
  depends: (resource: string, where?: Record<string, Scalar | readonly Scalar[]>) => void
  /** Aborted when the job's timeout passes or the worker shuts down. */
  signal: AbortSignal
}

/** The default export of `derived/<resource>.<name>.ts`: the value of the record with this key, as JSON can hold it. */
export type DerivedCompute = (key: string, context: DerivedContext) => unknown

type Query = { sql: string; parameters: readonly unknown[] }

// The database with every query it compiles kept, raw SQL included, as Postgres will get it.
const recordingDb = (db: Db, queries: Query[]): Db => {
  const executor = db.getExecutor()
  return db.withPlugin({
    transformQuery: ({ node, queryId }) => {
      const { sql, parameters } = executor.compileQuery(node, queryId)
      queries.push({ sql, parameters })
      return node
    },
    transformResult: async ({ result }) => result,
  })
}

// Postgres's own parser, loaded the first time a derived value runs.
const tableReads = async (queries: readonly Query[]): Promise<TableRead[]> => {
  if (queries.length === 0) return []
  const { parse } = await import('libpg-query')
  const reads = await Promise.all(queries.map(async ({ sql, parameters }) => ((await parse(sql)).stmts ?? []).flatMap(({ stmt }) => statementReads(stmt as never, parameters))))
  return reads.flat()
}

export type DerivedRunInput = {
  /** The derived value, as errors name it, such as `objectives.verdict`. */
  label: string
  db: Db
  now: Date
  /** The resources it may read: its own and those of its `reads`. */
  models: readonly ResourceModel[]
  /** Whether its queries are analysed. */
  track: boolean
  signal: AbortSignal
}

/** Runs a compute function, with what it read and when its clock's next check flips. */
export const runDerived = async (compute: DerivedCompute, key: string, { label, db, now, models, track, signal }: DerivedRunInput) => {
  const queries: Query[] = []
  const named: RecordedRead[] = []
  const { clock, flipsAt } = trackedClock(now)
  const depends = (resource: string, where?: Record<string, Scalar | readonly Scalar[]>) => {
    const model = models.find((candidate) => candidate.name === resource)
    if (!model) throw new Error(`${label} depends on ${resource}, which is not a resource it reads: add it to the value's reads`)
    named.push(namedRead(model, where))
  }
  // A read-only transaction, so Postgres refuses a write before it happens, whether the queries are analysed or not.
  const value = await db
    .transaction()
    .setAccessMode('read only')
    .execute(async (trx) => compute(key, { db: track ? recordingDb(trx, queries) : trx, clock, depends, signal }))
  const reads = [...resourceReads(label, await tableReads(queries), models), ...named]
  return { value: value === undefined ? null : value, reads, flipsAt: flipsAt() }
}
