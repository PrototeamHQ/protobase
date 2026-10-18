import { hooksScope, recording } from './mode'
import { openRecording, type Recording } from './recording'
import { createServerTimes } from './server-times'

// What the snapshot databases of the running test file share: its recording, the Postgres clock's times seen so far,
// and the databases opened outside a test, closed when the file ends.
type FileContext = {
  recording: Recording
  times: ReturnType<typeof createServerTimes>
  opened: Map<string, number>
  closeAtEnd: (() => Promise<void>)[]
}

let current: FileContext | undefined

export const startFile = (testFile: string) => {
  current = { recording: openRecording(testFile), times: createServerTimes(), opened: new Map(), closeAtEnd: [] }
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
