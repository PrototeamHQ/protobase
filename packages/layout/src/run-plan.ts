import { fillFilter } from '@protobase/schema/internal'
import { planReadId, type PlanRead, type ReadPlan } from './read-plan'
import { scopeLookup, scopeValue, type ValueScope } from './scope-values'

// Running a page's read plan: every read starts at once, each an ordinary request of its own, and a block inside the
// records of another takes the rows of each record out of its read's result by the field the read splits on.

/** What the page's address gives its reads before any record is read: its parameters, and its own record. */
export type PlanValues = Pick<ValueScope, 'params' | 'root'>

/** What one read gave: its records, an aggregate's groups as records `{ value, count }`, and a count's total. */
export type PlanResult = { rows: Record<string, unknown>[]; total?: number }

/** The read with the `{{@params.name}}` and `{{@root.key}}` slots of its filter filled from the address. */
export const fillPlanRead = (read: PlanRead, values: PlanValues): PlanRead =>
  read.filter === undefined ? read : { ...read, filter: fillFilter(read.filter, scopeLookup({ stack: [], ...values })) }

/** Every resource a read reads: its own, then those of the reads its `related()` terms carry, outermost last. */
export const planReadResources = (read: PlanRead, plan: ReadPlan): string[] => {
  const byId = new Map(plan.reads.map((each) => [planReadId(each), each]))
  const resources = [read.resource]
  for (let parent = read.split && byId.get(read.split.parent); parent; parent = parent.split && byId.get(parent.split.parent)) resources.push(parent.resource)
  return resources
}

/**
 * Starts every read of `plan` at once through `read`, its slots filled from `values`, and gives each read's outcome by
 * `planReadId`. A read that fails fails alone.
 */
export const runReadPlan = async (plan: ReadPlan, read: (planned: PlanRead) => Promise<PlanResult>, values: PlanValues = {}) => {
  const filled = plan.reads.map((planned) => fillPlanRead(planned, values))
  const settled = await Promise.allSettled(filled.map(read))
  return new Map(filled.map((planned, index) => [planReadId(planned), settled[index]!]))
}

/**
 * The rows of `rows`, the result of `read`, that belong where `scope` is: all of them for a read that splits on
 * nothing, and otherwise those whose split field holds the value its `source` reads there, or one of the keys of a
 * JSON list it holds; an aggregate's groups by their value. None when that value is empty.
 */
export const plannedRows = (read: PlanRead, rows: Record<string, unknown>[], scope: ValueScope) => {
  if (!read.split) return rows
  const value = scopeValue(scope, read.split.source)
  if (value === undefined || value === null || value === '') return []
  const field = read.kind === 'aggregate' ? 'value' : read.split.field
  // A key may come back as a number where the record holds it as text, or the other way round
  const wanted = new Set((Array.isArray(value) ? value : [value]).map(String))
  return rows.filter((row) => wanted.has(String(row[field])))
}
