import type { ToolRecord } from './records'
import { forcedJson } from './result-budget'

/** get_record's arguments that read one field in pieces, such as a field a result cut to fit its size limit. */
export const pieceParameters = {
  field: { type: 'string', description: 'One field to read alone, in pieces: max_chars characters of its value from offset. A value that is not text reads as its JSON.' },
  offset: { type: 'integer', minimum: 0, description: 'With field: the character to start at, 0 by default.' },
  max_chars: { type: 'integer', minimum: 1, maximum: 30_000, description: 'With field: the characters to read, 20000 by default.' },
}

const defaultChars = 20_000
const maxChars = 30_000

const invalid = (message: string) => JSON.stringify({ error: 'invalid-parameter', message })

const countOf = (value: unknown, fallback: number) => (value === undefined ? fallback : typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined)

/** Whether the call reads one field in pieces rather than the whole record. */
export const readsPiece = (args: Record<string, unknown>) => args.field !== undefined

/**
 * The piece of `args.field` of `found` the call asks for, as JSON ({ field, offset, length, value, next_offset }), where
 * length is the whole value's and next_offset is absent once the piece reaches its end.
 */
export const fieldPiece = (found: ToolRecord, args: Record<string, unknown>) => {
  const field = args.field
  if (typeof field !== 'string' || !Object.hasOwn(found.record, field)) return invalid(`Invalid parameter field: pass one of ${Object.keys(found.record).join(', ')}`)
  const offset = countOf(args.offset, 0)
  if (offset === undefined) return invalid('Invalid parameter offset: pass a whole number from 0')
  const chars = countOf(args.max_chars, defaultChars)
  if (!chars) return invalid(`Invalid parameter max_chars: pass a whole number from 1 to ${maxChars}`)
  const raw = found.record[field]
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw) ?? 'null'
  const end = offset + Math.min(chars, maxChars)
  const piece = { field, offset, length: text.length, value: text.slice(offset, end), ...(end < text.length && { next_offset: end }) }
  return forcedJson(piece, 'The value was cut to fit the size limit; pass a smaller max_chars.')
}
