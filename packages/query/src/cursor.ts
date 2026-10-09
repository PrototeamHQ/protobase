import { QueryError } from './errors'
import { sortSignature, type SortKey } from './sort'

type Cell = string | null
type Payload = { s: string[]; v: Cell[] }

const invalidCursor = () => new QueryError('invalid_cursor', 'Cursor is malformed or does not match the requested sort')

const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(item => typeof item === 'string')

const isCellList = (value: unknown): value is Cell[] =>
  Array.isArray(value) && value.every(item => item === null || typeof item === 'string')

/**
 * Opaque cursor: the sort signature plus the row's sort values as text (so timestamps and bigints round-trip exactly,
 * null for NULL values). The JSON is UTF-8 encoded before base64url, so any text value survives.
 * `values` may be a prefix of the sort keys; such a boundary cursor is produced by scroll anchors.
 */
export const encodeCursor = (keys: SortKey[], values: Cell[]) => {
  const payload: Payload = { s: sortSignature(keys).slice(0, values.length), v: values }
  return toBase64Url(JSON.stringify(payload))
}

export const decodeCursor = (cursor: string, keys: SortKey[]) => {
  const payload = parse(cursor)
  const signature = sortSignature(keys)
  const prefixOk = payload.s.length === payload.v.length && payload.s.every((part, i) => part === signature[i])
  const lengthOk = payload.v.length === keys.length || payload.v.length === 1
  if (!prefixOk || !lengthOk) throw invalidCursor()
  return payload.v
}

const parse = (cursor: string): Payload => {
  const payload = parseJson(cursor)
  if (typeof payload !== 'object' || payload === null) throw invalidCursor()
  const { s, v } = payload as Record<string, unknown>
  if (!isStringList(s) || !isCellList(v)) throw invalidCursor()
  return { s, v }
}

const toBase64Url = (text: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(text)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')

const fromBase64Url = (encoded: string) => {
  const binary = atob(encoded.replaceAll('-', '+').replaceAll('_', '/'))
  return new TextDecoder().decode(Uint8Array.from(binary, char => char.charCodeAt(0)))
}

/** atob throws DOMException (InvalidCharacterError) and TextDecoder/JSON throw TypeError/SyntaxError on garbage. */
const parseJson = (cursor: string): unknown => {
  try {
    return JSON.parse(fromBase64Url(cursor))
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof TypeError || error instanceof DOMException) throw invalidCursor()
    throw error
  }
}
