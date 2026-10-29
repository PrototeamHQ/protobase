import { describe, expect, it } from 'vitest'
import type { CallItem } from './call-reads'
import { callWatch } from './call-watch'
import { memoryCallStore } from './testing/memory-call-store'

const meeting = { resource: 'meetings', key: '1' }

describe('following a record\'s calls', () => {
  it('tells a page the calls at once, then only when they changed, until it stops', async () => {
    const store = memoryCallStore()
    const watch = callWatch(store)
    const seen: CallItem[][] = []
    const stop = await watch.add(meeting, (items) => seen.push(items))
    expect(seen).toEqual([[]])
    await store.admit({ record: meeting, member: 'ann', process: 'p', maxMembers: 8, maxMinutes: 60 })
    await watch.read()
    await watch.read()
    expect(seen).toHaveLength(2)
    expect(seen[1]).toEqual([expect.objectContaining({ started_by: 'ann', ended_at: null, members: [expect.objectContaining({ member: 'ann' })], removed: [] })])
    stop()
    await store.remove(seen[1]![0]!.id, 'ann')
    await watch.read()
    expect(seen).toHaveLength(2)
    expect(watch.size).toBe(0)
  })

  it('reads every followed record in one read, and tells each page of its own record only', async () => {
    const store = memoryCallStore()
    const watch = callWatch(store)
    const first: CallItem[][] = []
    const second: CallItem[][] = []
    await watch.add(meeting, (items) => first.push(items))
    await watch.add({ resource: 'meetings', key: '2' }, (items) => second.push(items))
    await store.admit({ record: meeting, member: 'ann', process: 'p', maxMembers: 8, maxMinutes: 60 })
    await watch.read()
    expect(first).toHaveLength(2)
    expect(second).toEqual([[]])
  })
})
