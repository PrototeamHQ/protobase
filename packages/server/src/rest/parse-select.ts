import { parseFieldPath, type FieldPath } from './field-path'
import { parseError, restError } from './rest-error'
import { splitList } from './split-list'

/** Every column, or a field with the name it goes by and a type it is cast to. */
export type ColumnItem = { kind: 'all' } | { kind: 'field'; field: FieldPath; alias?: string; cast?: string }

/**
 * Rows of another table, related through a foreign key: `alias:name!hint!inner(select)`. The hint names the foreign key
 * or its column when several relate the tables; `inner` keeps only the rows with a related row. An empty `select`
 * embeds nothing, which only filters with `inner`.
 */
export type EmbedItem = { kind: 'embed'; name: string; alias?: string; hint?: string; inner: boolean; select: SelectItem[] }

/** One item of `select`. */
export type SelectItem = ColumnItem | EmbedItem

// A type name and nothing that could end the cast: `text`, `int4`, `varchar`, `text[]`.
const typeName = /^[A-Za-z_][A-Za-z0-9_]*(\[\])?$/

// `alias:name!modifier!modifier(items)`.
const embedPattern = /^(?:([^:(!]+):(?!:))?([^!(]+)((?:![^!(]+)*)\(([\s\S]*)\)$/

const parseEmbed = (item: string): EmbedItem => {
  const [, alias, nameText = '', modifiers = '', inner = ''] = embedPattern.exec(item) ?? []
  const name = nameText.trim()
  if (!name || name.startsWith('...') || name.includes('.') || name === 'count') {
    throw restError(400, 'PGRST100', `"${item}" spreads a resource or calls an aggregate, which /api/sb/rest/v1 does not support yet`)
  }
  const flags = modifiers.split('!').slice(1).map((flag) => flag.trim())
  // The first modifier that is no join type is the hint, as PostgREST takes it.
  const hint = flags.find((flag) => flag !== 'inner' && flag !== 'left')
  return {
    kind: 'embed',
    name,
    ...(alias?.trim() && { alias: alias.trim() }),
    ...(hint !== undefined && { hint }),
    inner: flags.includes('inner'),
    select: inner.trim() === '' ? [] : splitList(inner).map(parseItem),
  }
}

const parseItem = (text: string): SelectItem => {
  const item = text.trim()
  if (item === '*') return { kind: 'all' }
  if (item.includes('(')) return parseEmbed(item)
  const aliased = /^([^:]+):(?!:)([\s\S]*)$/.exec(item)
  const alias = aliased?.[1]?.trim()
  const [fieldText = '', cast, ...more] = (aliased ? aliased[2]! : item).split('::')
  if (more.length > 0 || (cast !== undefined && !typeName.test(cast.trim()))) throw parseError(`"failed to parse select parameter (${item})"`, `"${cast}" is not a type name`)
  const field = parseFieldPath(fieldText)
  return { kind: 'field', field, ...(alias && { alias }), ...(cast !== undefined && { cast: cast.trim() }) }
}

/** Parses `select`: items separated by commas, `*` for every column. Missing or empty, it is `*`. */
export const parseSelect = (text: string | undefined): SelectItem[] => (text === undefined || text.trim() === '' ? [{ kind: 'all' }] : splitList(text).map(parseItem))

/** The name an embed goes by in a row and in the parameters that filter it: its alias, else its name. */
export const embedKey = (item: EmbedItem) => item.alias ?? item.name
