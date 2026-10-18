import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest'
import { fixClock } from './clock'
import { endFile, fileContext, startFile } from './context'
import { hooksScope, recording, staleSnapshot } from './mode'
import { seedRandomness, useSequence } from './random'

// Setup for the snapshot tests, in record and replay alike: a fixed clock, seeded randomness and UTC, so both issue
// the same queries, and the file's recording opened before its tests and written or checked after them.

process.env.TZ = 'UTC'

const unreadError = (left: ReturnType<ReturnType<typeof fileContext>['recording']['unread']>) =>
  staleSnapshot(`These recorded queries did not run: ${left.map(({ handle, left, first }) => `${left} on database ${handle}, from ${first.sql.slice(0, 200)}`).join('; ')}`)

beforeAll(({}, suite) => {
  if (new Date(0).getTimezoneOffset() !== 0) throw new Error('The snapshot tests need TZ=UTC')
  startFile('filepath' in suite ? suite.filepath : suite.file.filepath)
  fixClock()
  seedRandomness()
  useSequence(hooksScope, true)
})

beforeEach(({ task }) => {
  fixClock()
  useSequence(task.fullTestName, true)
  fileContext().recording.restart(task.fullTestName)
})

afterEach(({ task }) => {
  useSequence(hooksScope)
  if (recording || task.result?.errors?.length) return
  const left = fileContext().recording.unread(task.fullTestName)
  if (left.length) throw unreadError(left)
})

afterAll(async () => {
  const left = await endFile()
  vi.useRealTimers()
  vi.restoreAllMocks()
  if (left?.length) throw unreadError(left)
})
