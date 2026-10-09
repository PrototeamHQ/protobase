import type { DbCheck } from '../db/model'

const literal = /'((?:[^']|'')*)'(?:::[\w ]+)?/g

// Postgres normalises `col IN ('a', 'b')` to `col = ANY (ARRAY['a'::text, 'b'::text])`.
const parseAnyArray = (definition: string) => {
  const match = /= ANY \(\(?ARRAY\[(.+)\]\)/.exec(definition)
  if (!match) return undefined
  const list = match[1]!
  if (list.replace(literal, '').replace(/[\s,]/g, '') !== '') return undefined
  return [...list.matchAll(literal)].map((m) => m[1]!.replaceAll("''", "'"))
}

// Allowed values when a single-column CHECK constraint restricts the column to a literal list.
export const checkEnumValues = (checks: readonly DbCheck[], column: string) => {
  const single = checks.filter((check) => check.columns.length === 1 && check.columns[0] === column)
  return single.map((check) => parseAnyArray(check.definition)).find((values) => values)
}
