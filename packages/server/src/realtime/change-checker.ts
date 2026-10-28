import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import type { KeyValue } from '@protobase/schema'
import { decodeKey, encodeKey } from '@protobase/schema/internal'
import type { Caller } from '../api-keys/resolve-caller'
import { quoteIdent, tableSql } from '../changes/capture-sql'
import type { Entry } from '../registry'
import { callerSettings } from '../rest/caller-settings'
import { snapshotReadTransaction } from '../transactions'
import type { Row } from '../types'
import { filterSql, type FilterCondition } from './change-filter'
import { filterChunks } from './filter-chunks'
import { evaluateFilters } from './filter-evaluation'
import { attempt } from './savepoint-attempt'

/** A column as a change names it to realtime-js, which converts values by `type`. */
export type ChangeColumn = { name: string; type: string }

/** What one caller asks of one resource: the records whose current row it reads, those deleted, and its filters. */
export type ResourceCheck = { entry: Entry; keys: string[]; deleted: string[]; filters: FilterCondition[][] }

/** Callers whose role and claims are the same, checked as one. */
export type CheckGroup = { caller: Caller; resources: ResourceCheck[] }

/** A row as the caller may see it: the columns its role may select, its key alone, and whether it meets each filter. */
export type SeenRow = { record: Row; oldRecord: Row; matches: boolean[] }

/**
 * What a caller sees of a resource: the columns its role may select, the current rows of `keys` that its role and the
 * table's RLS policies let it select, by key, and the deleted records by key, which no policy can check any more.
 * `failed` holds the indexes of the filters Postgres refused, such as one on a column dropped since its join: they
 * match nothing.
 */
export type ResourceView = { columns: ChangeColumn[]; rows: Map<string, SeenRow>; deleted: Map<string, SeenRow>; failed: Set<number> }

export type ChangeCheckerOptions = {
  db: Db
  statementTimeoutMs: number
  /** Where the error of a group whose check failed goes; its callers see nothing of the batch. */
  report: (error: unknown) => void
}

const keyColumns = (entry: Entry) => entry.model.primaryKey.map((name) => entry.model.fields[name]!.column)

// The keys as rows of the table's own type, so Postgres compares them as the key columns' types and uses the key's index.
const keyRows = (entry: Entry, keys: readonly string[]) => {
  const columns = keyColumns(entry)
  return JSON.stringify(
    keys.map((key) => {
      const decoded = decodeKey(key, entry.keyTypes)
      const parts: KeyValue[] = Array.isArray(decoded) ? decoded : [decoded]
      return Object.fromEntries(columns.map((column, index) => [column, parts[index]]))
    }),
  )
}

const listed = (alias: string, columns: readonly string[]) => sql.raw(columns.map((column) => `${alias}.${quoteIdent(column)}`).join(', '))

const keyTexts = (alias: string, entry: Entry) => sql.raw(keyColumns(entry).map((column, index) => `${alias}.${quoteIdent(column)}::text as "k${index}"`).join(', '))

// The filters of `indexes`, each a column named by its index among all the resource's filters.
const filterColumns = (alias: string, filters: readonly FilterCondition[][], indexes: readonly number[]) =>
  indexes.length === 0 ? sql`` : sql`, ${sql.join(indexes.map((index) => sql`${filterSql(alias, filters[index]!)} as ${sql.ref(`f${index}`)}`))}`

type CheckedRow = Record<string, unknown> & { record?: Row; old_record: Row }

const keyOf = (entry: Entry, row: CheckedRow) => encodeKey(keyColumns(entry).map((_, index) => row[`k${index}`] as string))

const seen = (entry: Entry, filters: readonly FilterCondition[][], rows: readonly CheckedRow[]) =>
  new Map(rows.map((row): [string, SeenRow] => [keyOf(entry, row), { record: row.record ?? {}, oldRecord: row.old_record, matches: filters.map(() => false) }]))

// The matches of the filters of `indexes` onto the rows already seen; a row only a later query read is left out.
const merge = (entry: Entry, into: Map<string, SeenRow>, rows: readonly CheckedRow[], indexes: readonly number[]) => {
  for (const row of rows) {
    const found = into.get(keyOf(entry, row))
    if (found) for (const index of indexes) found.matches[index] = row[`f${index}`] === true
  }
}

const nothing = (columns: ChangeColumn[] = []): ResourceView => ({ columns, rows: new Map(), deleted: new Map(), failed: new Set() })

/**
 * Checks which changes callers may see, for every group in one read-only transaction that reads one snapshot: per group
 * it sets the role and claims as `/api/sb/rest/v1` does, then reads the current rows by key, so the table's RLS policies
 * decide, and evaluates each filter in Postgres, as the column's type compares, at most `filterChunkLimits` filters per
 * query. The transaction holds one pooled connection only while it runs.
 *
 * Each query runs in a savepoint. A resource whose rows cannot be read even without filters, such as after a REVOKE,
 * shows its group nothing of that resource; a filter Postgres refuses fails alone (`ResourceView.failed`), found by
 * halving its chunk. Any other error, such as a lost connection, fails the transaction: each group is then checked
 * again in a transaction of its own, so it costs only its own callers the batch.
 */
export const changeChecker = ({ db, statementTimeoutMs, report }: ChangeCheckerOptions) => {
  // The columns each role may select of each resource's table, read again after a read that the role was refused.
  const columnCache = new Map<string, ChangeColumn[]>()

  const columnsOf = async (trx: Db, entry: Entry, role: string) => {
    const cached = columnCache.get(`${entry.name}\0${role}`)
    if (cached) return cached
    const { rows } = await sql<ChangeColumn>`select a.attname as name, t.typname as type from pg_attribute a join pg_type t on t.oid = a.atttypid
      where a.attrelid = to_regclass(${tableSql(entry.model)}) and a.attnum > 0 and not a.attisdropped and has_column_privilege(a.attrelid, a.attnum, 'SELECT')
      order by a.attnum`.execute(trx)
    columnCache.set(`${entry.name}\0${role}`, rows)
    return rows
  }

  // The current rows and deleted records of the check, with the filters of `indexes`.
  const read = async (trx: Db, names: readonly string[], check: ResourceCheck, indexes: readonly number[]) => {
    const table = sql.raw(tableSql(check.entry.model))
    const key = listed('t', keyColumns(check.entry))
    const rows =
      check.keys.length === 0
        ? []
        : (
            await sql<CheckedRow>`select ${keyTexts('t', check.entry)}, (select to_jsonb(v) from (select ${listed('t', names)}) v) as record,
              (select to_jsonb(v) from (select ${key}) v) as old_record${filterColumns('t', check.filters, indexes)}
              from ${table} t where (${key}) in (select ${listed('k', keyColumns(check.entry))} from jsonb_populate_recordset(null::${table}, ${keyRows(check.entry, check.keys)}::jsonb) k)`.execute(trx)
          ).rows
    const deleted =
      check.deleted.length === 0
        ? []
        : (
            await sql<CheckedRow>`select ${keyTexts('k', check.entry)}, (select to_jsonb(v) from (select ${listed('k', keyColumns(check.entry))}) v) as old_record${filterColumns('k', check.filters, indexes)}
              from jsonb_populate_recordset(null::${table}, ${keyRows(check.entry, check.deleted)}::jsonb) k`.execute(trx)
          ).rows
    return { rows, deleted }
  }

  const view = async (trx: Db, role: string, check: ResourceCheck): Promise<ResourceView> => {
    const cacheKey = `${check.entry.name}\0${role}`
    let columns = await columnsOf(trx, check.entry, role)
    // A role that may not select the key sees no change of the table, as on Supabase.
    const keyed = () => keyColumns(check.entry).every((column) => columns.some(({ name }) => name === column))
    if (!keyed()) return nothing(columns)
    const [first = [], ...rest] = filterChunks(check.filters)
    // The rows come from the first query that reads them, with its filters. When it fails, the columns are read again,
    // in case one was dropped or revoked, and the rows with no filter: failing too, the group sees nothing of the resource.
    let base = await attempt(trx, 'change_check', () => read(trx, columns.map(({ name }) => name), check, first))
    const failedFirst = base.ok ? undefined : first
    if (!base.ok) {
      columnCache.delete(cacheKey)
      columns = await columnsOf(trx, check.entry, role)
      if (!keyed()) return nothing(columns)
      base = await attempt(trx, 'change_check', () => read(trx, columns.map(({ name }) => name), check, []))
    }
    if (!base.ok) {
      columnCache.delete(cacheKey)
      report(base.error)
      return nothing(columns)
    }
    const names = columns.map(({ name }) => name)
    const rows = seen(check.entry, check.filters, base.value.rows)
    const deleted = seen(check.entry, check.filters, base.value.deleted)
    if (failedFirst === undefined) {
      merge(check.entry, rows, base.value.rows, first)
      merge(check.entry, deleted, base.value.deleted, first)
    }
    const failed = await evaluateFilters(
      rest,
      async (indexes) => {
        const result = await attempt(trx, 'change_check', () => read(trx, names, check, indexes))
        if (result.ok) {
          merge(check.entry, rows, result.value.rows, indexes)
          merge(check.entry, deleted, result.value.deleted, indexes)
        }
        return result
      },
      failedFirst,
    )
    return { columns, rows, deleted, failed }
  }

  const checkGroups = (groups: readonly CheckGroup[]) =>
    snapshotReadTransaction(db, statementTimeoutMs, async (trx) => {
      const views: ResourceView[][] = []
      for (const group of groups) {
        // The app's role sets none: `none` goes back to the connection's own, and an empty user to none.
        const settings = { role: 'none', 'request.jwt.claim.sub': '', ...callerSettings(group.caller) }
        await sql`select ${sql.join(Object.entries(settings).map(([name, value]) => sql`set_config(${name}, ${value}, true)`))}`.execute(trx)
        const role = group.caller.role === 'app' ? 'app' : group.caller.role
        const resources: ResourceView[] = []
        for (const check of group.resources) resources.push(await view(trx, role, check))
        views.push(resources)
      }
      return views
    })

  const nothingOf = (group: CheckGroup) => group.resources.map(() => nothing())

  return async (groups: readonly CheckGroup[]): Promise<ResourceView[][]> => {
    if (groups.length === 0) return []
    return checkGroups(groups).catch(async (error: unknown) => {
      if (groups.length === 1) {
        report(error)
        return [nothingOf(groups[0]!)]
      }
      const views: ResourceView[][] = []
      for (const group of groups) {
        views.push(
          await checkGroups([group]).then(
            (checked) => checked[0]!,
            (failed: unknown) => {
              report(failed)
              return nothingOf(group)
            },
          ),
        )
      }
      return views
    })
  }
}

export type ChangeChecker = ReturnType<typeof changeChecker>
