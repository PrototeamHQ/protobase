import { describe, expect, it } from 'vitest'
import type { LoadedRun, RunStore, SegmentQueue } from '@protobase/workflows'
import { failAfterLastTry } from './last-try'

const setup = (blockOf: string | null) => {
  const updates: unknown[] = []
  const woken: string[] = []
  const store = { load: async () => ({ blockOf }) as LoadedRun, update: async (_db: null, id: string, change: unknown) => void updates.push([id, change]) } as unknown as RunStore<null>
  const queue: SegmentQueue<null> = { schedule: async () => {}, wake: async (_db, id) => void woken.push(id) }
  return { store, queue, updates, woken }
}

describe('failAfterLastTry', () => {
  it("fails a block's run and wakes the run waiting for it", async () => {
    const { store, queue, updates, woken } = setup('parent')
    await failAfterLastTry(store, queue, null, 'child', 10)
    expect(updates).toEqual([['child', { status: 'failed', error: 'States.Runtime', cause: "The run's segment failed 10 times in a row" }]])
    expect(woken).toEqual(['parent'])
  })

  it('wakes nothing for a run no block started', async () => {
    const { store, queue, woken } = setup(null)
    await failAfterLastTry(store, queue, null, 'run', 10)
    expect(woken).toEqual([])
  })
})
