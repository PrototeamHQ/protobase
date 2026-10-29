import { describe, expect, it } from 'vitest'
import type { Db } from '@protobase/query'
import type { FunctionSocket } from '../functions/function-socket'
import type { CallItem } from './call-reads'
import type { CallRecord } from './call-store'
import { callsRuntime } from './calls-runtime'
import { ringer } from './ringer'
import { settle } from './testing/call-harness'
import { memoryCallStore } from './testing/memory-call-store'
import { memoryRingStore } from './testing/memory-ring-store'

const record: CallRecord = { resource: 'conversations', key: '7' }
const ring = { users: ['ann', 'bob', 'cat'], title: 'Ann is calling' }

const runtimeWithRings = () => {
  const store = memoryCallStore()
  const ringStore = memoryRingStore((call) => store.calls.get(call)?.ended_at !== undefined)
  const announced: [CallRecord, CallItem[]][] = []
  const reported: unknown[] = []
  const runtime = callsRuntime({
    db: {} as Db,
    timeoutMs: 1000,
    options: { backend: { kind: 'peer' } },
    report: (error) => void reported.push(error),
    store,
    rings: ringer({ store: ringStore, recordUrl: () => '/conversations/7' }),
    announce: async (to, items) => void announced.push([to, items]),
  })
  const join = async (user: string, withRing = true) => {
    const events = await runtime.relay(record, user, { publish: true }, { user, ...(withRing && { ring }) })
    const browser = { send: async () => {}, close: () => {}, bufferedAmount: 0 } satisfies FunctionSocket
    await events.onOpen!(browser)
    await events.onMessage!(JSON.stringify({ type: 'join' }), browser)
    await settle()
    return { leave: async () => {
      await events.onMessage!(JSON.stringify({ type: 'leave' }), browser)
      await events.onClose!(1000, '')
      await settle()
    } }
  }
  return { runtime, ringStore, announced, reported, join }
}

describe('calls runtime', () => {
  it('rings the people a join names only when that join starts the call', async () => {
    const { ringStore, join, reported } = runtimeWithRings()
    await join('ann')
    await join('dan')
    expect(ringStore.rings.map((one) => one.user)).toEqual(['bob', 'cat'])
    expect(reported).toEqual([])
  })

  it("stops a user's ring once they join the call, from any device", async () => {
    const { runtime, join } = runtimeWithRings()
    await join('ann')
    await join('bob', false)
    expect(await runtime.rings().of('bob')).toEqual([])
    expect(await runtime.rings().of('cat')).toHaveLength(1)
  })

  it('stops every ring once the call ends', async () => {
    const { runtime, ringStore, join } = runtimeWithRings()
    const ann = await join('ann')
    await ann.leave()
    expect(await runtime.rings().of('cat')).toEqual([])
    expect(ringStore.notices.at(-1)).toEqual(['bob', 'cat'])
  })

  it("tells the record's readers its calls whenever a member joins or leaves", async () => {
    const { announced, join } = runtimeWithRings()
    const ann = await join('ann', false)
    expect(announced.at(-1)?.[0]).toEqual(record)
    expect(announced.at(-1)?.[1][0]?.members.map((member) => member.member)).toEqual(['ann'])
    await ann.leave()
    expect(announced.at(-1)?.[1][0]?.ended_at).not.toBeNull()
  })
})
