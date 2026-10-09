import { sql } from 'kysely'
import type { ListQuery, ResourceModel } from '@protobase/schema'
import { baseQuery } from './base-query'
import { columnRef, findField } from './columns'
import { decodeCursor, encodeCursor } from './cursor'
import type { Db } from './db'
import { QueryError } from './errors'
import type { Scope } from './scope'
import { assertFilterRequirements } from './filter-requirements'
import { orderTerm } from './order'
import { seekCondition } from './seek'
import { effectiveSort, flip, type SortKey } from './sort'

export const maxLimit = 500

export type ListResult = {
  rows: Array<Record<string, unknown>>
  nextCursor: string | null
  prevCursor: string | null
}

/** An extra output column, mapped from a model field and never from raw SQL. */
export type ExtraColumn = { field: string; as: 'text'; alias: string }
export type ListOptions = {
  /** `as: 'text'` selects `column::text`, so timestamps and numerics keep full database precision. */
  extraColumns?: ExtraColumn[]
}

const keyAlias = (index: number) => `__pb_key${index}`

const clampLimit = (limit: number) => {
  if (!Number.isInteger(limit) || limit < 1) throw new QueryError('invalid_limit', 'limit must be a positive integer')
  return Math.min(limit, maxLimit)
}

const requestedFields = (model: ResourceModel, columns?: string[]) =>
  (columns ?? Object.keys(model.fields)).map(name => findField(model, name))

export type ListPlan = {
  /** The exact query listQuery runs (fetches limit + 1 rows); explain it, or execute it yourself. */
  query: ReturnType<typeof selectPage>
  limit: number
  keys: SortKey[]
  reverse: boolean
  hasCursor: boolean
}

const extraSelections = (model: ResourceModel, extras: ExtraColumn[] = []) =>
  extras.map(({ field, as, alias }) => {
    if (as !== 'text') throw new QueryError('invalid_option', 'extraColumns only supports as: "text"')
    if (Object.hasOwn(model.fields, alias) || alias.startsWith('__pb_key')) {
      throw new QueryError('invalid_option', `extra column alias "${alias}" collides with a field or internal column`)
    }
    return sql`${columnRef(findField(model, field))}::text`.as(alias)
  })

const selectPage = (db: Db, model: ResourceModel, query: ListQuery, scope: Scope | undefined, keys: SortKey[], cursorValues: Array<string | null> | undefined, options: ListOptions) => {
  const reading = query.direction ?? 'after'
  const reverse = reading === 'before'
  let select = baseQuery(db, model, query.filter, scope)
    .select(requestedFields(model, query.columns).map(field => sql`${columnRef(field)}`.as(field.name)))
    .select(extraSelections(model, options.extraColumns))
    .select(keys.map((key, i) => sql`${columnRef(key.field)}::text`.as(keyAlias(i))))
  if (cursorValues) select = select.where(seekCondition(keys, cursorValues, reading))
  for (const key of keys) select = select.orderBy(orderTerm(key, reverse ? flip(key.direction) : key.direction))
  return select.limit(clampLimit(query.limit) + 1)
}

/** Validates the request and builds, without executing, the query listQuery would run. */
export const buildListQuery = async (db: Db, model: ResourceModel, query: ListQuery, scope?: Scope, options: ListOptions = {}): Promise<ListPlan> => {
  const limit = clampLimit(query.limit)
  await assertFilterRequirements(db, query.filter, scope)
  const keys = effectiveSort(model, query.sort)
  const cursorValues = query.cursor === undefined ? undefined : decodeCursor(query.cursor, keys)
  return {
    query: selectPage(db, model, query, scope, keys, cursorValues, options),
    limit,
    keys,
    reverse: query.direction === 'before',
    hasCursor: cursorValues !== undefined,
  }
}

export const listQuery = async (db: Db, model: ResourceModel, query: ListQuery, scope?: Scope, options: ListOptions = {}): Promise<ListResult> => {
  const { query: select, limit, keys, reverse, hasCursor } = await buildListQuery(db, model, query, scope, options)
  const fetched = await select.execute() as Array<Record<string, unknown>>
  const more = fetched.length > limit
  const page = more ? fetched.slice(0, limit) : fetched
  if (reverse) page.reverse()

  const cursorOf = (row: Record<string, unknown>) => encodeCursor(keys, keys.map((_, i) => (row[keyAlias(i)] === null ? null : String(row[keyAlias(i)]))))
  const first = page[0]
  const last = page.at(-1)

  return {
    rows: page.map(row => Object.fromEntries(Object.entries(row).filter(([name]) => !name.startsWith('__pb_key')))),
    nextCursor: last && (reverse ? hasCursor : more) ? cursorOf(last) : null,
    prevCursor: first && (reverse ? more : hasCursor) ? cursorOf(first) : null,
  }
}
