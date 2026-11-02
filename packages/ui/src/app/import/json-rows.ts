import type { SheetCell, SheetRow } from './sheet-cell'
import { text } from './messages'

// Where the browser passes it, a reviver sees each value's source text: a whole number past what a JavaScript number
// holds exactly keeps its digits as text, so a bigint field or a text field gets what the file states, not a rounded number
type ReviverContext = { source?: string }
const exactNumbers = (_key: string, value: unknown, context?: ReviverContext) =>
  typeof value === 'number' && Number.isInteger(value) && !Number.isSafeInteger(value) && context?.source && /^-?\d+$/.test(context.source) ? context.source : value

const parse = (bytes: ArrayBuffer): unknown => {
  try {
    // Fatal, so a file in another encoding is refused rather than read with replacement characters
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes), exactNumbers as (key: string, value: unknown) => unknown)
  } catch (error) {
    if (error instanceof TypeError || error instanceof SyntaxError) throw new Error(text('jsonInvalid'))
    throw error
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

// A value as a cell: a scalar as it is, a nested object or array as JSON
const cellOf = (value: unknown): SheetCell => {
  if (value === undefined || value === null) return null
  if (typeof value === 'object') return { json: value }
  return value as string | number | boolean
}

/**
 * The rows of a JSON file that holds an array of objects, read whole: the header is the objects' keys in the order they
 * first appear, and each object is a row, with an empty cell where it lacks a key. Lines are numbered as the other
 * formats number them: the header is line 1, the first object line 2.
 */
export const jsonRows = async (file: Blob): Promise<SheetRow[]> => {
  const parsed = parse(await file.arrayBuffer())
  if (!Array.isArray(parsed) || !parsed.every(isRecord)) throw new Error(text('jsonNotList'))
  const columns = new Map<string, number>()
  for (const object of parsed) for (const key of Object.keys(object)) if (!columns.has(key)) columns.set(key, columns.size)
  const keys = [...columns.keys()]
  const rows = parsed.map((object, index) => ({ line: index + 2, cells: keys.map((key) => cellOf(object[key])) }))
  return [{ line: 1, cells: keys }, ...rows]
}
