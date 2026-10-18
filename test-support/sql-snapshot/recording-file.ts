import type { RawError, RawParam, RawResult } from './values'

// The file a recording lives in, `<test>.sql.json`: the queries of a test file by the test that ran them (or `(hooks)`)
// and then by the database they went to. One entry per line, and a long result one row per line, so a change to the SQL
// or the data shows as a small diff. A long entry that comes back more than once, such as Better Auth's read of the whole
// store's schema at each createAuth, is kept once under `(repeated)` and named by its place there.

/** One query and what Postgres answered: one result, one per statement of a multi-statement text, or an error. */
export type Entry = { sql: string; params?: RawParam[]; result?: RawResult | RawResult[]; error?: RawError }

export type Streams = Record<string, Record<string, Entry[]>>

const repeatedKey = '(repeated)'
const long = 1000

export const parseStreams = (text: string): Streams => {
  const { [repeatedKey]: repeated = [], ...streams } = JSON.parse(text) as Record<string, unknown>
  const expand = (entry: Entry | { repeated: number }) => ('repeated' in entry ? (repeated as Entry[])[entry.repeated]! : entry)
  return Object.fromEntries(Object.entries(streams as Record<string, Record<string, (Entry | { repeated: number })[]>>).map(([scope, handles]) => [
    scope,
    Object.fromEntries(Object.entries(handles).map(([handle, entries]) => [handle, entries.map(expand)])),
  ]))
}

const formatResult = (result: RawResult, indent: string) => {
  const { rows, ...rest } = result
  const head = JSON.stringify(rest).slice(0, -1)
  if (rows.length <= 1) return `${head},"rows":${JSON.stringify(rows)}}`
  return `${head},"rows":[\n${rows.map((row) => `${indent}  ${JSON.stringify(row)}`).join(',\n')}\n${indent}]}`
}

const formatEntry = (entry: Entry, indent: string) => {
  const { result, ...rest } = entry
  if (!result) return JSON.stringify(rest)
  const head = JSON.stringify(rest).slice(0, -1)
  const shown = Array.isArray(result) ? `[${result.map((one) => formatResult(one, indent)).join(',')}]` : formatResult(result, indent)
  return `${head},"result":${shown}}`
}

export const formatStreams = (streams: Streams) => {
  const all = Object.values(streams).flatMap((handles) => Object.values(handles).flat())
  const counts = new Map<string, number>()
  for (const entry of all) {
    const text = JSON.stringify(entry)
    if (text.length >= long) counts.set(text, (counts.get(text) ?? 0) + 1)
  }
  const repeated = [...counts].filter(([, count]) => count > 1).map(([text]) => text)
  const places = new Map(repeated.map((text, at) => [text, at]))
  const shownEntry = (entry: Entry) => {
    const at = places.get(JSON.stringify(entry))
    return at === undefined ? formatEntry(entry, '      ') : JSON.stringify({ repeated: at })
  }

  const scopes = Object.entries(streams).map(([scope, handles]) => {
    // By handle, as databases opened at the same time may each query first.
    const shown = Object.entries(handles).sort(([a], [b]) => a.localeCompare(b)).map(([handle, entries]) => `    ${JSON.stringify(handle)}: [\n${entries.map((entry) => `      ${shownEntry(entry)}`).join(',\n')}\n    ]`)
    return `  ${JSON.stringify(scope)}: {\n${shown.join(',\n')}\n  }`
  })
  const table = repeated.length ? [`  ${JSON.stringify(repeatedKey)}: [\n${repeated.map((text) => `    ${formatEntry(JSON.parse(text), '    ')}`).join(',\n')}\n  ]`] : []
  return `{\n${[...table, ...scopes].join(',\n')}\n}\n`
}
