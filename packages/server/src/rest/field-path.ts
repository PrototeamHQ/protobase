import { parseError } from './rest-error'

/** One arrow of a JSON path: `->` keeps JSON, `->>` gives text; a key of digits is an array index. */
export type JsonStep = { arrow: '->' | '->>'; key: string | number }

/** A column, and the JSON path into it: `meta->>kind`. */
export type FieldPath = { column: string; json: JsonStep[] }

/** Parses `column`, `column->key` or `column->a->>b`; `->` may not end it or follow a `->>`. */
export const parseFieldPath = (text: string): FieldPath => {
  const parts = text.trim().split(/(->>|->)/)
  const column = parts[0]!.trim()
  if (!column) throw parseError(`"${text}" names no column`)
  const json: JsonStep[] = []
  for (let i = 1; i < parts.length; i += 2) {
    const key = parts[i + 1]!.trim()
    if (!key) throw parseError(`"${text}" ends in an arrow`)
    json.push({ arrow: parts[i] as JsonStep['arrow'], key: /^-?\d+$/.test(key) ? Number(key) : key })
  }
  return { column, json }
}

/** The name a JSON path's value goes by in a row: its last key, else the column. */
export const pathName = (path: FieldPath) => String(path.json.at(-1)?.key ?? path.column)
