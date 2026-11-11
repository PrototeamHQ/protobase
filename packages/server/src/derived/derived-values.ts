import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import type { DerivedModel, KeyValue } from '@protobase/schema'
import { encodeKey } from '@protobase/schema/internal'
import type { ResourceChange } from '../changes/resource-change'
import type { Deps } from '../deps'
import { enqueueJob } from '../jobs/declared-job'
import { defineJob } from '../jobs/define-job'
import type { Entry } from '../registry'
import { changeKeys, fieldTypes, touches } from './affected'
import { derivedName, fillJobName } from './derived-sql'
import { candidateReads, claim, forget, keep, markStale, recalculating, type ValueRef } from './derived-state'
import { runDerived, type DerivedCompute } from './run-derived'
import { recordExists, writeField, writeSideField } from './write-target'

export type DerivedInput = {
  deps: Deps
  /** Each derived value's compute function, by its name across resources: `<resource>.<name>`. */
  computes: Record<string, DerivedCompute>
  /** The names of the app's jobs, which a derived value's `job` must be one of. */
  jobNames: readonly string[]
  /** The time its clocks read; tests fix it. */
  now?: () => Date
}

/** The wait before a stale value is computed, so the changes of a burst are taken in one run. */
const settle = '1 second'

/** Records of a derived value the fill job reads at a time. */
const fillPage = 500

type Declared = { name: string; entry: Entry; value: DerivedModel; compute: DerivedCompute }

const problemsOf = ({ name, entry, value }: Omit<Declared, 'compute'>, deps: Deps, computes: Record<string, DerivedCompute>, jobNames: readonly string[]) => {
  const problems = value.reads.filter((read) => !deps.registry.find(read)).map((read) => `reads "${read}", which is not a resource`)
  if (!computes[name]) problems.push(`has no compute function: write it as the default export of derived/${name}.ts`)
  if (value.job && !jobNames.includes(value.job)) problems.push(`enqueues the job "${value.job}", which the config does not declare`)
  const into = value.into && value.into.resource !== entry.name ? deps.registry.find(value.into.resource) : undefined
  if (value.into && value.into.resource !== entry.name && !into) problems.push(`goes into "${value.into.resource}", which is not a resource`)
  if (into && !into.model.fields[value.into!.field]) problems.push(`goes into "${value.into!.field}" of ${into.name}, which is not a field`)
  if (into && into.keyTypes.join() !== entry.keyTypes.join()) problems.push(`goes into ${into.name}, whose key is not of the same types as ${entry.name}'s`)
  return problems.map((problem) => `Derived value ${name} ${problem}`)
}

/**
 * Derived values kept current: `derived.compute` runs a record's compute function, keeps what it read and writes the
 * value where it goes when it differs; `derived.fill` computes every record of a newly declared value once; and
 * `onChanges`, in the dispatch of captured changes, marks stale the values a change touches and queues their runs.
 * `undefined` when no resource has derived values.
 */
export const createDerived = ({ deps, computes, jobNames, now = () => new Date() }: DerivedInput) => {
  const declared: Declared[] = deps.registry.entries.flatMap((entry) =>
    (entry.model.derived ?? []).map((value) => ({ name: derivedName(entry.name, value.name), entry, value, compute: computes[derivedName(entry.name, value.name)]! })),
  )
  if (declared.length === 0) return undefined
  const problems = declared.flatMap((item) => problemsOf(item, deps, computes, jobNames))
  if (problems.length > 0) throw new Error(problems.join('; '))
  const byName = new Map(declared.map((item) => [item.name, item]))
  const typesOf = (resource: string) => fieldTypes(deps.registry.find(resource)!.model)
  const readable = (item: Declared) => [item.entry.model, ...item.value.reads.map((read) => deps.registry.find(read)!.model)]
  const watched = new Set(declared.flatMap((item) => [item.entry.name, ...item.value.reads]))

  const queue = async (db: Db, refs: readonly ValueRef[]) => {
    await markStale(db, refs)
    for (const ref of refs) await compute.enqueue(db, ref, { key: `change:${ref.name}:${ref.key}`, delay: settle })
  }

  const compute = defineJob<ValueRef>({
    name: 'derived.compute',
    concurrency: 4,
    timeout: '5 minutes',
    run: async (ref, { db, signal }) => {
      const item = byName.get(ref.name)
      if (!item) return
      if (!(await recordExists(db, item.entry, ref.key))) return forget(db, [ref])
      const version = await claim(db, ref)
      const result = await runDerived(item.compute, ref.key, { label: `Derived value ${item.name}`, db, now: now(), models: readable(item), track: item.value.track !== false, signal })
      await db.transaction().execute(async (trx) => {
        const changed = await keep(trx, ref, version, result, typesOf)
        if (changed === undefined) return
        const { into, job } = item.value
        if (into && into.resource === item.entry.name) await writeField(trx, item.entry, into.field, ref.key, result.value)
        if (into && into.resource !== item.entry.name) await writeSideField(trx, deps.registry.find(into.resource)!, into.field, ref.key, result.value)
        if (job && changed) await enqueueJob(trx, job, { resource: item.entry.name, key: ref.key, value: result.value })
        if (result.flipsAt) await compute.enqueue(trx, ref, { key: `clock:${ref.name}:${ref.key}`, mode: 'replace', runAt: result.flipsAt })
      })
    },
  })

  // Every record of a value, a page at a time, each queued as stale.
  const fill = defineJob<{ name: string }>({
    name: fillJobName,
    timeout: '15 minutes',
    run: async ({ name }, { db }) => {
      const item = byName.get(name)
      if (!item) return
      const { model } = item.entry
      const table = model.table.schema ? sql.id(model.table.schema, model.table.name) : sql.id(model.table.name)
      const columns = model.primaryKey.map((field) => model.fields[field]!.column)
      for (let offset = 0; ; offset += fillPage) {
        const { rows } = await sql<Record<string, KeyValue>>`select ${sql.join(columns.map((column) => sql.id(column)))} from ${table} order by ${sql.join(columns.map((column) => sql.id(column)))} limit ${fillPage} offset ${offset}`.execute(db)
        await queue(db, rows.map((row) => ({ name, key: encodeKey(columns.map((column) => row[column]!)) })))
        if (rows.length < fillPage) return
      }
    },
  })

  /**
   * Marks stale, in the dispatch's transaction, every value a change touches, the values of new records, and those whose
   * run is under way and reads a changed resource; forgets those of deleted ones.
   */
  const onChanges = async (trx: Db, changes: readonly ResourceChange[]) => {
    const relevant = changes.filter((change) => watched.has(change.resource))
    if (relevant.length === 0) return
    const own = (change: ResourceChange) => declared.filter((item) => item.entry.name === change.resource).map((item) => ({ name: item.name, key: change.key }))
    await forget(trx, relevant.filter((change) => !change.after).flatMap(own))
    const stale = new Map<string, ValueRef>(relevant.filter((change) => !change.before).flatMap(own).map((ref) => [`${ref.name}:${ref.key}`, ref]))
    const resources = new Set(relevant.map((change) => change.resource))
    const readers = declared.filter((item) => resources.has(item.entry.name) || item.value.reads.some((read) => resources.has(read))).map((item) => item.name)
    for (const ref of await recalculating(trx, readers)) stale.set(`${ref.name}:${ref.key}`, ref)
    const reads = await candidateReads(trx, [...resources], changeKeys(relevant, typesOf))
    for (const read of reads) {
      if (relevant.some((change) => touches(read, change, typesOf(change.resource)))) stale.set(`${read.name}:${read.key}`, { name: read.name, key: read.key })
    }
    await queue(trx, [...stale.values()])
  }

  return { jobs: [compute, fill], onChanges }
}
