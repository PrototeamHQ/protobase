import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest'
import { fixClock, unfixClock } from './clock'
import { endFile, fileContext, startFile } from './context'
import { settle } from './activity'
import { hooksScope, inScope, recording, staleSnapshot } from './mode'
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

// Again before each test, which may have put crypto back (vi.restoreAllMocks) or used fake timers of its own. What the
// hooks or the test before left running counts as the hooks' work, and ends before this test begins.
beforeEach(async ({ task }) => {
  await inScope(hooksScope, () => settle())
  fixClock()
  seedRandomness()
  useSequence(task.fullTestName, true)
  fileContext().recording.restart(task.fullTestName)
})

afterEach(async ({ task }) => {
  await settle()
  useSequence(hooksScope)
  const [stale] = fileContext().takeStale()
  if (stale) throw stale
  if (recording || task.result?.errors?.length) return
  const left = fileContext().recording.unread(task.fullTestName)
  if (left.length) throw unreadError(left)
})

afterAll(async () => {
  await settle()
  const [stale] = fileContext().takeStale()
  const left = await endFile()
  unfixClock()
  vi.restoreAllMocks()
  if (stale) throw stale
  if (left?.length) throw unreadError(left)
})
