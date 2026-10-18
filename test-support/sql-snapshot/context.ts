import { hooksScope, recording, staleSnapshot } from './mode'
import { openRecording, type Recording } from './recording'
import { createServerValues } from './server-values'

// What the snapshot databases of the running test file share: its recording, the values Postgres made up so far,
// and the databases opened outside a test, closed when the file ends.
type FileContext = {
  recording: Recording
  values: ReturnType<typeof createServerValues>
  opened: Map<string, number>
  closeAtEnd: (() => Promise<void>)[]
  /** Makes a stale-snapshot error and keeps it, so the test fails with it even when the app turns it into a 500. */
  stale: (why: string) => Error
  /** The stale-snapshot errors so far, taken. */
  takeStale: () => Error[]
}

let current: FileContext | undefined

export const startFile = (testFile: string) => {
  const errors: Error[] = []
  const stale = (why: string) => {
    const error = staleSnapshot(why)
    errors.push(error)
    return error
  }
  current = { recording: openRecording(testFile), values: createServerValues(), opened: new Map(), closeAtEnd: [], stale, takeStale: () => errors.splice(0) }
}

export const fileContext = () => {
  if (!current) throw new Error('A snapshot database opened outside a snapshot test: test-support/sql-snapshot/setup.ts starts each file')
  return current
}

/** The key of the next database opened in `scope`: the scope and its count there, the same in record and replay. */
export const nextHandle = (scope: string) => {
  const context = fileContext()
  const n = context.opened.get(scope) ?? 0
  context.opened.set(scope, n + 1)
  return `${scope}#${n}`
}

/** Closes what the file left open and writes its recording, or checks that replay read all of the hooks' queries. */
export const endFile = async () => {
  const context = fileContext()
  current = undefined
  for (const close of context.closeAtEnd) await close()
  if (recording) return context.recording.write()
  return context.recording.unread(hooksScope)
}
