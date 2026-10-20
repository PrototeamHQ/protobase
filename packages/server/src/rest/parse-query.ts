import { parseFilter, type Filter } from './parse-filter'
import { parseOrder, type OrderTerm } from './parse-order'
import { parseSelect, type SelectItem } from './parse-select'
import { parseError } from './rest-error'
import { splitList, unquote } from './split-list'

/** The rows a request asks for, as its query string and `Range` header say. */
export type RestQuery = {
  select: SelectItem[]
  filters: Filter[]
  order: OrderTerm[]
  /** The first row and the most rows, from `offset` and `limit` and the `Range` header, whichever is narrower. */
  range: { offset: number; limit?: number }
  /** The columns an upsert's conflict is on (`on_conflict`). */
  onConflict?: string[]
  /** The columns an insert writes (`columns`), which supabase-js sends with several rows. */
  columns?: string[]
}

const reserved = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'])

const count = (name: string, text: string) => {
  if (!/^\d+$/.test(text)) throw parseError(`"failed to parse ${name} (${text})"`, `${name} takes a whole number`)
  return Number(text)
}

const names = (text: string) => splitList(text).map((name) => unquote(name.trim()))

/** `Range: 2-4` or `Range: 5-`, in items; anything else asks for every row, as PostgREST takes it. */
const rangeHeader = (header: string | null) => {
  const match = header === null ? null : /^\s*(\d+)-(\d*)\s*$/.exec(header)
  if (!match) return { offset: 0 }
  const offset = Number(match[1])
  return match[2] === '' ? { offset } : { offset, limit: Math.max(0, Number(match[2]) - offset + 1) }
}

const intersect = (a: RestQuery['range'], b: RestQuery['range']): RestQuery['range'] => {
  const offset = Math.max(a.offset, b.offset)
  const ends = [a, b].flatMap((range) => (range.limit === undefined ? [] : [range.offset + range.limit]))
  return ends.length === 0 ? { offset } : { offset, limit: Math.max(0, Math.min(...ends) - offset) }
}

/**
 * Parses a request's query parameters. The ones in `args` are a function's arguments, not filters. `select`, `order`,
 * `limit`, `offset`, `on_conflict` and `columns` count once, the first time; every other parameter is a filter.
 */
export const parseQuery = (params: [string, string][], rangeText: string | null = null, args: ReadonlySet<string> = new Set()): RestQuery => {
  const first = (name: string) => params.find(([key]) => key === name)?.[1]
  const limit = first('limit')
  const offset = first('offset')
  const order = first('order')
  const onConflict = first('on_conflict')
  const columns = first('columns')
  const fromParams = { offset: offset === undefined ? 0 : count('offset', offset), ...(limit !== undefined && { limit: count('limit', limit) }) }
  return {
    select: parseSelect(first('select')),
    filters: params.filter(([key]) => !reserved.has(key) && !args.has(key)).map(([key, value]) => parseFilter(key, value)),
    order: order === undefined ? [] : parseOrder(order),
    range: intersect(fromParams, rangeHeader(rangeText)),
    ...(onConflict !== undefined && { onConflict: names(onConflict) }),
    ...(columns !== undefined && { columns: names(columns) }),
  }
}
