import { sql } from 'kysely'
import { buildListQuery, compileFilter, explainGuard, type Db, type GuardFinding } from '@protobase/query'
import type { CheckedFilter, FieldModel, ResourceModel, SortSpec } from '@protobase/schema'
import { filterFields, filterShape } from './filter-shape'
import { HttpProblem } from './problem'
import type { Entry } from './registry'
import { scopeConditions, tableId } from './sql-parts'
import type { Scope } from '@protobase/query'
import type { ScanGuardMode } from './types'

export type ListShape = { filter?: CheckedFilter; sort?: SortSpec; limit: number }

/** The model the query runs against (as the caller sees it) and its scope (tenant, row filter, full model). */
export type GuardContext = { model: ResourceModel; scope: Scope }

type Verdict = { findings: GuardFinding[]; suggestion: string }

const maxCached = 1000

// Two plans per shape. "filtered" has the scope and filter only: without a LIMIT the planner cannot hide an unindexed
// filter behind a walk of the primary key index. "paged" is the real page query from the query layer (filter, ORDER BY,
// LIMIT): it exposes an unindexed sort, which becomes a scan plus a sort.
const filteredQuery = (db: Db, entry: Entry, shape: ListShape, { scope }: GuardContext) => {
  const { model } = entry
  const conditions = [
    ...scopeConditions(scope.fullModel ?? model, scope.tenantValue),
    ...(scope.rowFilter ? [compileFilter(model, scope.rowFilter)] : []),
    ...(shape.filter ? [compileFilter(model, shape.filter)] : []),
  ]
  let query = db.selectFrom(sql`${tableId(model)}`.as('t')).select(sql.lit(1).as('one'))
  for (const condition of conditions) query = query.where(condition)
  return query
}

const pagedQuery = async (db: Db, shape: ListShape, { model, scope }: GuardContext) => {
  const { query } = await buildListQuery(db, model, shape, scope)
  return query
}

const indexStatement = (entry: Entry, fields: FieldModel[]) => {
  const { schema, name } = entry.model.table
  const table = schema ? `"${schema}"."${name}"` : `"${name}"`
  const columns = [...new Set(fields.map((field) => field.column))]
  if (columns.length === 0) return 'an index that covers the filter your role is limited by'
  return `create index on ${table} (${columns.map((column) => `"${column}"`).join(', ')})`
}

/** Plans each list query shape once (EXPLAIN, never executed) and remembers the verdict. */
export const createScanGuard = (db: Db, options: { mode?: ScanGuardMode; seqScanRows?: number } = {}) => {
  const { mode = 'reject', seqScanRows } = options
  const verdicts = new Map<string, Verdict>()
  // Sort findings are switched off: under a LIMIT the plan's row estimate for a Sort or Incremental Sort is the whole
  // input, though Postgres stops after one page. An unindexed sort still shows up as a sequential scan.
  const thresholds = { ...(seqScanRows && { seqScanRows }), sortRows: Number.MAX_SAFE_INTEGER }

  const judge = async (entry: Entry, shape: ListShape, context: GuardContext): Promise<Verdict> => {
    const filtered = shape.filter ? await explainGuard(db, filteredQuery(db, entry, shape, context), thresholds) : undefined
    const paged = await explainGuard(db, await pagedQuery(db, shape, context), thresholds)
    const sortField = shape.sort?.[0] && entry.model.fields[shape.sort[0][0]]
    const suggestions = [
      ...(filtered && !filtered.ok ? [indexStatement(entry, filterFields(shape.filter))] : []),
      ...(!paged.ok && sortField ? [indexStatement(entry, [sortField])] : []),
    ]
    return { findings: [...(filtered?.findings ?? []), ...paged.findings], suggestion: suggestions[0] ?? indexStatement(entry, filterFields(shape.filter)) }
  }

  const verdictFor = async (entry: Entry, shape: ListShape, context: GuardContext) => {
    const key = `${entry.name}|${filterShape(context.scope.rowFilter)}|${filterShape(shape.filter)}|${(shape.sort ?? []).map(([name, direction]) => `${name}:${direction}`).join(',')}`
    const known = verdicts.get(key)
    if (known) return known
    const verdict = await judge(entry, shape, context)
    if (verdicts.size >= maxCached) verdicts.delete(verdicts.keys().next().value!)
    verdicts.set(key, verdict)
    return verdict
  }

  /** Throws a 400 problem for an expensive shape in `reject` mode; in `warn` mode returns the warning text. */
  return async (entry: Entry, shape: ListShape, context: GuardContext) => {
    if (mode === 'off') return undefined
    const { findings, suggestion } = await verdictFor(entry, shape, context)
    const finding = findings[0]
    if (!finding) return undefined
    const detail = `This query would sequentially scan "${finding.relation}" (about ${finding.rows} rows). Add an index, for example: ${suggestion}`
    if (mode === 'warn') return detail
    throw new HttpProblem(400, 'expensive-query', 'Bad Request', detail, { findings, suggestion })
  }
}

export type ScanGuard = ReturnType<typeof createScanGuard>
