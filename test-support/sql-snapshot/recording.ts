import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { recording } from './mode'
import { formatStreams, parseStreams, type Entry, type Streams } from './recording-file'

/** `<test file without .ts>.sql.json`, next to the test. */
export const recordingPath = (testFile: string) => testFile.replace(/\.[cm]?[jt]s$/, '.sql.json')

/** The recording of one test file: read for replay, or filled and written by `bun run test:record`. */
export const openRecording = (testFile: string) => {
  const file = recordingPath(testFile)
  const exists = existsSync(file)
  // Recording starts afresh; replay reads what the last recording wrote.
  const streams: Streams = exists && !recording ? parseStreams(readFileSync(file, 'utf8')) : {}
  // The positions replay has answered from, by scope and handle.
  const read = new Map<string, Set<number>>()
  const key = (scope: string, handle: string) => `${scope}\u0000${handle}`
  const readOf = (scope: string, handle: string) => {
    const k = key(scope, handle)
    if (!read.has(k)) read.set(k, new Set())
    return read.get(k)!
  }

  return {
    file,
    /** The file as the messages name it, from the working directory. */
    name: path.relative(process.cwd(), file),
    exists,
    /**
     * The first recorded query of `scope` on `handle` not answered yet that `fits`, marked as answered; requests that
     * run at the same time may reach the connection in another order than they did when recording. Without one that
     * fits, `entry` is undefined and `expected` the first one not answered yet.
     */
    take: (scope: string, handle: string, fits: (entry: Entry) => boolean) => {
      const entries = streams[scope]?.[handle] ?? []
      const taken = readOf(scope, handle)
      const open = entries.map((entry, at) => ({ entry, at })).filter(({ at }) => !taken.has(at))
      const found = open.find(({ entry }) => fits(entry))
      if (found) taken.add(found.at)
      return { entry: found?.entry, at: found?.at ?? open[0]?.at ?? entries.length, expected: open[0]?.entry }
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
        const taken = readOf(scope, handle)
        const left = entries.filter((_, at) => !taken.has(at))
        return left.length ? [{ handle, left: left.length, first: left[0]! }] : []
      }),
    /** Writes what was recorded; a file that queried nothing keeps no recording. */
    write: () => {
      if (Object.keys(streams).length) writeFileSync(file, formatStreams(streams))
      else if (exists) rmSync(file)
    },
  }
}

export type Recording = ReturnType<typeof openRecording>

export type { Entry } from './recording-file'
