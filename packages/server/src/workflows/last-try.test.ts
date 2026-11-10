import { describe, expect, it } from 'vitest'
import type { LoadedRun, RunStore, SegmentQueue } from '@protobase/workflows'
import { failAfterLastTry } from './last-try'

const setup = (blockOf: string | null, wakeFails?: Error) => {
  const updates: unknown[] = []
  const woken: string[] = []
  const store = { load: async () => ({ blockOf }) as LoadedRun, update: async (_db: null, id: string, change: unknown) => void updates.push([id, change]) } as unknown as RunStore<null>
  const queue: SegmentQueue<null> = {
    schedule: async () => {},
    wake: async (_db, id) => {
      if (wakeFails) throw wakeFails
      woken.push(id)
    },
  }
  return { store, queue, updates, woken }
}

const segmentError = new Error('segment')

describe('failAfterLastTry', () => {
  it("fails a block's run, wakes the run waiting for it and throws the segment's error", async () => {
    const { store, queue, updates, woken } = setup('parent')
    await expect(failAfterLastTry(store, queue, null, 'child', 10, segmentError)).rejects.toBe(segmentError)
    expect(updates).toEqual([['child', { status: 'failed', error: 'States.Runtime', cause: "The run's segment failed 10 times in a row" }]])
    expect(woken).toEqual(['parent'])
  })

  it('wakes nothing for a run no block started', async () => {
    const { store, queue, woken } = setup(null)
    await expect(failAfterLastTry(store, queue, null, 'run', 10, segmentError)).rejects.toBe(segmentError)
    expect(woken).toEqual([])
  })

  it("keeps the segment's error first when waking the waiting run fails", async () => {
    const wakeError = new Error('wake')
    const { store, queue, updates } = setup('parent', wakeError)
    const thrown = await failAfterLastTry(store, queue, null, 'child', 10, segmentError).catch((error: unknown) => error)
    expect(thrown).toBeInstanceOf(AggregateError)
    expect((thrown as AggregateError).errors).toEqual([segmentError, wakeError])
    expect(updates).toHaveLength(1)
  })
})
