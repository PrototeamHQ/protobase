import { describe, expect, it } from 'vitest'
import { ringer, ringSeconds, type RingNotification } from './ringer'
import { memoryRingStore } from './testing/memory-ring-store'

const record = { resource: 'conversations', key: '7' }
const recordUrl = ({ resource, key }: { resource: string; key: string }) => `/${resource}/${key}`
const ring = { users: ['ann', 'bob', 'cat'], title: 'Ann is calling' }

describe('ringer', () => {
  it('rings everyone it names but the caller, tells their pages, and keeps the ring in their bell', async () => {
    const store = memoryRingStore()
    const sent: RingNotification[] = []
    await ringer({ store, recordUrl, notify: async (notification) => void sent.push(notification) }).start('c1', record, 'ann', ring)
    expect(store.rings.map((one) => one.user)).toEqual(['bob', 'cat'])
    expect(store.rings[0]!.until - Date.now()).toBeGreaterThan((ringSeconds - 1) * 1000)
    expect(store.notices).toEqual([['bob', 'cat']])
    expect(sent).toEqual([{ userIds: ['bob', 'cat'], title: 'Ann is calling', url: '/conversations/7', data: { call: 'c1', resource: 'conversations', key: '7' } }])
  })

  it('rings no one on do not disturb on any page, and still keeps the ring in their bell', async () => {
    const store = memoryRingStore()
    const sent: RingNotification[] = []
    const rings = ringer({ store, recordUrl, doNotDisturb: async () => new Set(['bob']), notify: async (notification) => void sent.push(notification) })
    await rings.start('c1', record, 'ann', ring)
    expect(store.rings.map((one) => one.user)).toEqual(['cat'])
    expect(store.notices).toEqual([['cat']])
    expect(await rings.of('bob')).toEqual([])
    expect(sent[0]!.userIds).toEqual(['bob', 'cat'])
  })

  it('rings everyone it names in an app without status, which has no do not disturb to ask', async () => {
    const store = memoryRingStore()
    const rings = ringer({ store, recordUrl })
    await rings.start('c1', record, 'ann', ring)
    expect((await rings.of('bob')).map((one) => one.title)).toEqual(['Ann is calling'])
    expect((await rings.of('cat')).map((one) => one.title)).toEqual(['Ann is calling'])
  })

  it("leads the bell's entry where the app says, with the ring's body", async () => {
    const sent: RingNotification[] = []
    await ringer({ store: memoryRingStore(), recordUrl, notify: async (notification) => void sent.push(notification) }).start('c1', record, 'ann', { ...ring, body: 'Design review', url: '/rooms/7' })
    expect(sent[0]).toMatchObject({ body: 'Design review', url: '/rooms/7' })
  })

  it('stops ringing a user who joins or declines, telling only their pages, once', async () => {
    const store = memoryRingStore()
    const rings = ringer({ store, recordUrl })
    await rings.start('c1', record, 'ann', ring)
    await rings.stop('c1', 'bob')
    await rings.stop('c1', 'bob')
    expect(store.notices).toEqual([['bob', 'cat'], ['bob']])
    expect(await rings.of('bob')).toEqual([])
    expect(await rings.of('cat')).toHaveLength(1)
  })

  it('stops ringing everyone once the call ended, telling those it still rang', async () => {
    let over = false
    const store = memoryRingStore(() => over)
    const rings = ringer({ store, recordUrl })
    await rings.start('c1', record, 'ann', ring)
    await rings.stop('c1', 'bob')
    await rings.settle()
    expect(store.notices).toHaveLength(2)
    over = true
    await rings.settle()
    expect(store.notices.at(-1)).toEqual(['cat'])
    expect(await rings.of('cat')).toEqual([])
  })

  it('rings no one when the caller names only themselves', async () => {
    const sent: RingNotification[] = []
    const store = memoryRingStore()
    await ringer({ store, recordUrl, notify: async (notification) => void sent.push(notification) }).start('c1', record, 'ann', { users: ['ann'], title: 'Ann is calling' })
    expect(store.notices).toEqual([])
    expect(sent).toEqual([])
  })
})
