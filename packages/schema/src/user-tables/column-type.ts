import { cellKind, isEmptyFileCell, plainNumber, type CellKind, type FileCell } from './cell-kind'
import type { UserTableFieldType } from './names'

/** The type a column of a file becomes, with a decimal's precision and scale. */
export type ColumnType = {
  /** The field type of a table users add. */
  type: UserTableFieldType
  /** A decimal's digits in all. */
  precision?: number
  /** A decimal's digits after the point. */
  scale?: number
}

/** A decimal number's type, which always has its precision and scale. */
export type DecimalType = ColumnType & {
  /** Its digits in all, from 1 to 1000. */
  precision: number
  /** Its digits after the point, at most the precision. */
  scale: number
}

/** Reads a column's cells one at a time; see `columnTypeReader`. */
export type ColumnTypeReader = {
  /** Reads one more cell of the column. */
  add: (cell: FileCell) => void
  /** The type every cell read so far is written as. */
  type: () => ColumnType
  /** The decimal number that holds every number read so far, for a column of numbers or one changed to a decimal. */
  decimal: () => DecimalType
}

/** The most characters a `text` field holds; a column with a longer value is `long_text`. */
export const maxShortText = 500

/** The digits a decimal keeps before its point at least: 15, as many as a spreadsheet keeps of a number. */
export const minWholeDigits = 15

const maxPrecision = 1000
const int4 = 2147483647n

const kindTypes: Record<Exclude<CellKind, 'whole' | 'decimal' | 'text'>, UserTableFieldType> = {
  boolean: 'boolean',
  date: 'date',
  local: 'timestamp',
  zoned: 'timestamp',
  json: 'json',
}

/**
 * Reads a column's cells one at a time and keeps only what its type needs, so a file of any length is read in the
 * memory of one row: `add` each cell, then `type()` is one type every non-empty cell is written as, else text, and
 * nothing else.
 *
 * - Whole numbers are `integer`, or a decimal of scale 0 once one is past the integer range.
 * - Whole numbers with decimals are a `decimal` whose scale is the most digits after the point, with room for at least
 *   `minWholeDigits` before it.
 * - True or false is `boolean`, ISO dates `date`, ISO dates and times `timestamp`: a time without a zone is read in
 *   the browser's time zone, as Import reads one.
 * - A column with a nested JSON value is `json`, which holds its other values as they are.
 * - A column of mixed forms, or of no values, is text: `long_text` once a value is over `maxShortText` characters.
 */
export const columnTypeReader = (): ColumnTypeReader => {
  const kinds = new Set<CellKind>()
  let wholeDigits = 1
  let scale = 0
  let pastInteger = false
  let longest = 0

  const add = (cell: FileCell) => {
    if (cell === null || isEmptyFileCell(cell)) return
    if (typeof cell === 'string') longest = Math.max(longest, cell.length)
    const kind = cellKind(cell)
    kinds.add(kind)
    if (kind !== 'whole' && kind !== 'decimal') return
    const [whole = '', fraction = ''] = plainNumber(cell as string | number).replace('-', '').split('.')
    wholeDigits = Math.max(wholeDigits, whole.length)
    scale = Math.max(scale, fraction.length)
    if (kind === 'whole' && !pastInteger) {
      const value = BigInt(plainNumber(cell as string | number))
      pastInteger = (value < 0n ? -value - 1n : value) > int4
    }
  }

  const decimal = (): DecimalType => {
    const precision = Math.min(maxPrecision, Math.max(wholeDigits, minWholeDigits) + scale)
    return { type: 'decimal', precision, scale: Math.min(scale, precision) }
  }

  const type = (): ColumnType => {
    if (kinds.has('json')) return { type: 'json' }
    const only = kinds.size === 1 ? [...kinds][0] : undefined
    if (only === 'whole') return pastInteger ? decimal() : { type: 'integer' }
    if (kinds.size === 2 && kinds.has('whole') && kinds.has('decimal')) return decimal()
    if (only === 'decimal') return decimal()
    if (only && only !== 'text') return { type: kindTypes[only] }
    return { type: longest > maxShortText ? 'long_text' : 'text' }
  }

  return { add, type, decimal }
}

/** The type of a column from all its cells at once; see `columnTypeReader`. */
export const inferColumnType = (cells: Iterable<FileCell>) => {
  const reader = columnTypeReader()
  for (const cell of cells) reader.add(cell)
  return reader.type()
}

/**
 * The types a column of `type` may be changed to, itself first: only less specific ones, which take every value it
 * holds as the file wrote it. A long text and a JSON column keep their type.
 */
export const widerFieldTypes = (type: UserTableFieldType): UserTableFieldType[] => {
  switch (type) {
    case 'integer':
      return ['integer', 'decimal', 'text', 'long_text']
    case 'decimal':
    case 'boolean':
    case 'date':
    case 'timestamp':
      return [type, 'text', 'long_text']
    case 'text':
      return ['text', 'long_text']
    case 'long_text':
    case 'json':
      return [type]
  }
}
