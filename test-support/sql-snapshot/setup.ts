import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest'
import { fixClock, unfixClock } from './clock'
import { endFile, fileContext, fileRunning, startFile } from './context'
import { settle } from './activity'
import { hooksScope, inScope, recording, staleSnapshot } from './mode'
import { seedRandomness, useSequence } from './random'

// Setup for the snapshot tests, in record and replay alike: a fixed clock, seeded randomness and UTC, so both issue
// the same queries, and the file's recording opened before its tests and written or checked after them.

process.env.TZ = 'UTC'

// Bun binds `import { randomBytes } from 'node:crypto'` once, so patching node:crypto (random.ts) never reaches it, as
// it does on Node. Better Auth hashes passwords that way, so the snapshot projects run it through Vitest (`inline`),
// where these named exports call whatever node:crypto's own object holds when they run: the seeded sequence.
vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto') & { default: typeof import('node:crypto') }>()
  const live = actual.default
  return {
    ...actual,
    randomBytes: ((...args: Parameters<typeof live.randomBytes>) => live.randomBytes(...args)) as typeof live.randomBytes,
    randomUUID: (() => live.randomUUID()) as typeof live.randomUUID,
    randomFillSync: ((...args: Parameters<typeof live.randomFillSync>) => live.randomFillSync(...args)) as typeof live.randomFillSync,
  }
})

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
  const context = fileContext()
  await settle()
  const [stale] = context.takeStale()
  const left = await endFile(context)
  if (!fileRunning()) {
    unfixClock()
    vi.restoreAllMocks()
  }
  if (stale) throw stale
  if (left?.length) throw unreadError(left)
})
