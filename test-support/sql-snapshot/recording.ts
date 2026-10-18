import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { recording } from './mode'
import type { RawError, RawParam, RawResult } from './values'

/** One query and what Postgres answered: one result, one per statement of a multi-statement text, or an error. */
export type Entry = { sql: string; params?: RawParam[]; result?: RawResult | RawResult[]; error?: RawError }

// The queries of a test file, by the test that ran them (or `(hooks)`) and then by the database they went to.
type Streams = Record<string, Record<string, Entry[]>>

/** `<test file without .ts>.sql.json`, next to the test. */
export const recordingPath = (testFile: string) => testFile.replace(/\.[cm]?[jt]s$/, '.sql.json')

/** The recording of one test file: read for replay, or filled and written by `bun run test:record`. */
export const openRecording = (testFile: string) => {
  const file = recordingPath(testFile)
  const exists = existsSync(file)
  // Recording starts afresh; replay reads what the last recording wrote.
  const streams: Streams = exists && !recording ? JSON.parse(readFileSync(file, 'utf8')) : {}
  const read = new Map<string, number>()
  const key = (scope: string, handle: string) => `${scope}\u0000${handle}`

  return {
    file,
    /** The file as the messages name it, from the working directory. */
    name: path.relative(process.cwd(), file),
    exists,
    /** The next recorded query of `scope` on `handle`, or undefined after the last. */
    next: (scope: string, handle: string) => {
      const at = read.get(key(scope, handle)) ?? 0
      read.set(key(scope, handle), at + 1)
      return { entry: streams[scope]?.[handle]?.[at], at }
    },
    append: (scope: string, handle: string, entry: Entry) => {
      const handles = (streams[scope] ??= {})
      ;(handles[handle] ??= []).push(entry)
    },
    /** Starts `scope` over, as a retried test does: its recording again from the start, or empty when recording. */
    restart: (scope: string) => {
      if (recording) delete streams[scope]
      for (const handle of Object.keys(streams[scope] ?? {})) read.delete(key(scope, handle))
    },
    /** The handles of `scope` whose recording the test did not get through, with how many queries it left. */
    unread: (scope: string) =>
      Object.entries(streams[scope] ?? {}).flatMap(([handle, entries]) => {
        const left = entries.length - (read.get(key(scope, handle)) ?? 0)
        return left > 0 ? [{ handle, left, first: entries[entries.length - left]! }] : []
      }),
    /** Writes what was recorded; a file that queried nothing keeps no recording. */
    write: () => {
      if (Object.keys(streams).length) writeFileSync(file, formatStreams(streams))
      else if (exists) rmSync(file)
    },
  }
}

export type Recording = ReturnType<typeof openRecording>

// One entry per line, and a long result one row per line, so a change to the SQL or the data shows as a small diff.
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

const formatStreams = (streams: Streams) => {
  const scopes = Object.entries(streams).map(([scope, handles]) => {
    const shown = Object.entries(handles).map(([handle, entries]) => `    ${JSON.stringify(handle)}: [\n${entries.map((entry) => `      ${formatEntry(entry, '      ')}`).join(',\n')}\n    ]`)
    return `  ${JSON.stringify(scope)}: {\n${shown.join(',\n')}\n  }`
  })
  return `{\n${scopes.join(',\n')}\n}\n`
}
