import type { Entry } from '../registry'
import { parseFilter, type FilterCondition } from './change-filter'

export type ChangeEvent = 'INSERT' | 'UPDATE' | 'DELETE'

/** One `postgres_changes` binding of a joined channel: the changes of `entries` that it hears of. */
export type ChangeBinding = {
  /** The id the join reply gives it, which each change it hears of names. */
  id: number
  event: ChangeEvent | '*'
  /** The filter as the client sent it: subscribers with the same one share its check. */
  filter: string | undefined
  conditions: FilterCondition[]
  entries: Entry[]
}

/** What the join reply echoes of a binding, so realtime-js matches it with its own. */
export type BindingReply = { id: number; event: string; schema: string; table?: string; filter?: string }

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const optionalText = (value: unknown) => (typeof value === 'string' && value !== '' ? value : undefined)

const eventOf = (value: unknown): ChangeEvent | '*' => {
  const upper = typeof value === 'string' ? value.toUpperCase() : '*'
  return upper === 'INSERT' || upper === 'UPDATE' || upper === 'DELETE' ? upper : '*'
}

/** The schema a resource's table is in, `public` when it names none. */
export const schemaOf = (entry: Entry) => entry.model.table.schema ?? 'public'

const columnsOf = (entry: Entry) => new Set(Object.values(entry.model.fields).map((field) => field.column))

const unavailable = (schema: string, table: string | undefined, filter: string | undefined) =>
  `Unable to subscribe to changes with given parameters. Please check Realtime is enabled for the given connect parameters: [schema: ${schema}, table: ${table ?? '*'}, filters: ${filter ?? '[]'}]`

/**
 * The bindings a join asks for, each over the live resources whose table it names: by schema (`*` for any), table
 * (any when left out or `*`), event (`*` for all) and filter. A binding whose table is not live, a filter that does not
 * parse or names a column the table has not, and a `select` of columns are refused with Supabase's message, as an error
 * text.
 */
export const parseBindings = (requested: unknown, live: readonly Entry[], nextId: () => number): { bindings: ChangeBinding[]; replies: BindingReply[] } | string => {
  if (requested === undefined) return { bindings: [], replies: [] }
  if (!Array.isArray(requested)) return 'postgres_changes must be a list'
  const bindings: ChangeBinding[] = []
  const replies: BindingReply[] = []
  for (const item of requested) {
    if (!isRecord(item)) return 'Each postgres_changes binding must be an object'
    const schema = optionalText(item.schema) ?? 'public'
    const table = optionalText(item.table)
    const filter = optionalText(item.filter)
    if (item.select !== undefined) return 'Not implemented: postgres_changes select; leave it out to receive every column'
    const entries = live.filter((entry) => (schema === '*' || schemaOf(entry) === schema) && (table === undefined || table === '*' || entry.model.table.name === table))
    if (entries.length === 0) return unavailable(schema, table, filter)
    const conditions = parseFilter(filter)
    if (typeof conditions === 'string') return conditions
    const missing = conditions.find((condition) => entries.some((entry) => !columnsOf(entry).has(condition.column)))
    if (missing) return `invalid column for filter ${missing.column}`
    const id = nextId()
    const event = eventOf(item.event)
    bindings.push({ id, event, filter, conditions, entries })
    replies.push({ id, event: typeof item.event === 'string' ? item.event : '*', schema, ...(table !== undefined && { table }), ...(filter !== undefined && { filter }) })
  }
  return { bindings, replies }
}
