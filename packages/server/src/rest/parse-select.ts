import { parseFieldPath, type FieldPath } from './field-path'
import { parseError, restError } from './rest-error'
import { splitList } from './split-list'

/** One item of `select`: every column, or a field with the name it goes by and a type it is cast to. */
export type SelectItem = { kind: 'all' } | { kind: 'field'; field: FieldPath; alias?: string; cast?: string }

// A type name and nothing that could end the cast: `text`, `int4`, `varchar`, `text[]`.
const typeName = /^[A-Za-z_][A-Za-z0-9_]*(\[\])?$/

const parseItem = (text: string): SelectItem => {
  const item = text.trim()
  if (item === '*') return { kind: 'all' }
  if (item.includes('(')) throw restError(400, 'PGRST100', `"${item}" embeds a resource or calls an aggregate, which /rest/v1 does not support yet`)
  const aliased = /^([^:]+):(?!:)([\s\S]*)$/.exec(item)
  const alias = aliased?.[1]?.trim()
  const [fieldText = '', cast, ...more] = (aliased ? aliased[2]! : item).split('::')
  if (more.length > 0 || (cast !== undefined && !typeName.test(cast.trim()))) throw parseError(`"failed to parse select parameter (${item})"`, `"${cast}" is not a type name`)
  const field = parseFieldPath(fieldText)
  return { kind: 'field', field, ...(alias && { alias }), ...(cast !== undefined && { cast: cast.trim() }) }
}

/** Parses `select`: items separated by commas, `*` for every column. Missing or empty, it is `*`. */
export const parseSelect = (text: string | undefined): SelectItem[] => (text === undefined || text.trim() === '' ? [{ kind: 'all' }] : splitList(text).map(parseItem))
