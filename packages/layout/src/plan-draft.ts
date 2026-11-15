import { printFilter, type FilterExpr, type ResourceModel } from '@protobase/schema'
import { relatedErrors } from '@protobase/schema/internal'
import type { PlanRead } from './read-plan'
import { restoreSlots, type Slots } from './plan-slots'

/** A read while the page is walked: its filter as a syntax tree, and the fields its scope reads, `undefined` for all. */
export type Draft = Omit<PlanRead, 'filter' | 'fields'> & { filter?: FilterExpr; fields: Set<string> | undefined }

/** What compiling one page shares: the models, its page parameters, its slots, and the problems and warnings found. */
export type PlanContext = {
  models: Record<string, ResourceModel>
  params: ReadonlySet<string>
  slots: Slots
  problems: string[]
  warnings: string[]
}

/** The read of each record of the stack, by its place in it; `undefined` for an `ArrayField` item, which no read holds. */
export type Rows = ReadonlyArray<Draft | undefined>

/** Adds `name` to what `draft` reads, unless it reads every field. */
export const reads = (draft: Draft | undefined, name: string) => {
  draft?.fields?.add(name)
}

/** The read as `/api/meta` sends it: its filter printed with its slots put back, its fields sorted. */
export const finalRead = (draft: Draft, context: PlanContext, label: string): PlanRead => {
  const { filter, fields, ...rest } = draft
  for (const error of filter ? relatedErrors(filter) : []) context.problems.push(`${label}: its planned read cannot be made: ${error.message}`)
  return {
    ...rest,
    ...(filter && { filter: restoreSlots(printFilter(filter), context.slots) }),
    // An ETag hashes the whole record, so a read that asks for one reads every field; a nested read's rows are told
    // apart by the field it splits on
    ...(fields && !draft.etag && { fields: [...new Set([...fields, ...(draft.split ? [draft.split.field] : [])])].sort() }),
  }
}
