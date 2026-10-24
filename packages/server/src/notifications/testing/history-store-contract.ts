import { afterEach, describe, expect, it, vi } from 'vitest'
import { historyIdPattern, historyLimits, type NewNotification } from '../history'
import { maxHistoryPage, maxUnreadCount, type HistoryStore } from '../history-store'

export const note = (n = 1): NewNotification => ({ title: `Notification ${n}`, body: null, url: null, data: null })

const minute = (n: number) => new Date(Date.UTC(2026, 6, 1, 0, n))

// Records each notification at its own minute, the first the oldest.
const recordAt = async (store: HistoryStore, userId: string, minutes: number[]) => {
  const stored = []
  for (const n of minutes) {
    vi.setSystemTime(minute(n))
    stored.push(await store.record(userId, note(n)))
  }
  return stored
}

const titles = (entries: { title: string }[]) => entries.map((entry) => entry.title)

/**
 * What every history store must do, for a store `open` makes empty for each test; `users` are ids the store's users
 * table holds, when it has one, the second's id starting with the first's.
 */
export const historyStoreContract = (name: string, open: () => Promise<HistoryStore>, [a, b]: readonly [string, string] = ['u1', 'u10']) =>
  describe(`${name}: the history store contract`, () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('keeps a notification as given, unread, under an id that fits a path', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(minute(1))
      const store = await open()
      const given: NewNotification = { title: 'Ada commented', body: 'Line one\nline two', url: '/tasks/1', data: { task: 1, tags: ['a'], nested: { ok: true } } }
      const stored = await store.record(a, given)
      expect(stored).toEqual({ ...given, id: expect.stringMatching(historyIdPattern), userId: a, createdAt: minute(1), readAt: null })
      expect(await store.list(a, { limit: 10 })).toEqual([stored])
      expect(await store.countUnread(a)).toBe(1)
    })

    it('lists newest first, page by page, ties by id', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      const store = await open()
      await recordAt(store, a, [1, 2, 3, 3, 4])
      const first = await store.list(a, { limit: 2 })
      expect(titles(first)).toEqual(['Notification 4', 'Notification 3'])
      const last = first.at(-1)!
      const second = await store.list(a, { before: { createdAt: last.createdAt, id: last.id }, limit: 2 })
      const third = await store.list(a, { before: { createdAt: second.at(-1)!.createdAt, id: second.at(-1)!.id }, limit: 2 })
      const all = [...first, ...second, ...third]
      expect(titles(all)).toEqual(['Notification 4', 'Notification 3', 'Notification 3', 'Notification 2', 'Notification 1'])
      expect(new Set(all.map((entry) => entry.id)).size).toBe(5)
      expect(all[1]!.id > all[2]!.id).toBe(true)
    })

    it("keeps each user's entries apart, for users whose ids share a prefix", async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      const store = await open()
      const [own] = await recordAt(store, a, [1])
      const [theirs] = await recordAt(store, b, [2])
      expect(await store.markRead(a, theirs!.id)).toBe(false)
      vi.setSystemTime(minute(10))
      await store.markAllRead(a, minute(10))
      expect(await store.countUnread(b)).toBe(1)
      expect((await store.list(b, { limit: 10 }))[0]!.readAt).toBeNull()
      expect(await store.list(a, { limit: 10 })).toEqual([{ ...own, readAt: minute(10) }])
      // A position taken from B's list gives A only A's own.
      expect(await store.list(a, { before: { createdAt: minute(3), id: theirs!.id }, limit: 10 })).toEqual([{ ...own, readAt: minute(10) }])
      await store.removeAllForUser(a)
      expect(await store.list(a, { limit: 10 })).toEqual([])
      expect(await store.list(b, { limit: 10 })).toEqual([theirs])
    })

    it('marks one read once, keeping the first read time', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      const store = await open()
      const [entry] = await recordAt(store, a, [1])
      vi.setSystemTime(minute(5))
      expect(await store.markRead(a, entry!.id)).toBe(true)
      vi.setSystemTime(minute(6))
      expect(await store.markRead(a, entry!.id)).toBe(true)
      expect((await store.list(a, { limit: 1 }))[0]!.readAt).toEqual(minute(5))
      expect(await store.countUnread(a)).toBe(0)
      expect(await store.markRead(a, '00000000-0000-4000-8000-000000000000')).toBe(false)
      expect(await store.markRead(a, 'not-an-id')).toBe(false)
    })

    it('marks all read up to a time, leaving later entries unread and read ones as they were', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      const store = await open()
      const [old, middle] = await recordAt(store, a, [1, 2, 3])
      vi.setSystemTime(minute(4))
      await store.markRead(a, old!.id)
      vi.setSystemTime(minute(9))
      await store.markAllRead(a, middle!.createdAt)
      const read = Object.fromEntries((await store.list(a, { limit: 10 })).map((entry) => [entry.title, entry.readAt]))
      expect(read).toEqual({ 'Notification 1': minute(4), 'Notification 2': minute(9), 'Notification 3': null })
      expect(await store.countUnread(a)).toBe(1)
    })

    it(`counts unread entries up to ${maxUnreadCount}`, async () => {
      const store = await open()
      for (let n = 0; n <= maxUnreadCount; n++) await store.record(a, note(n))
      expect(await store.countUnread(a)).toBe(maxUnreadCount)
    })

    it(`gives at most ${maxHistoryPage} at once`, async () => {
      const store = await open()
      await store.record(a, note())
      for (const limit of [0, -1, 2.5, maxHistoryPage + 1, Number.NaN]) await expect(store.list(a, { limit })).rejects.toThrow()
      expect(await store.list(a, { limit: maxHistoryPage })).toHaveLength(1)
    })

    it('refuses a notification outside its limits, keeping nothing', async () => {
      const store = await open()
      const refused: NewNotification[] = [
        { ...note(), title: '' },
        { ...note(), title: 'x'.repeat(historyLimits.title + 1) },
        { ...note(), title: 'a\u0000b' },
        { ...note(), body: 'x'.repeat(historyLimits.body + 1) },
        { ...note(), body: 'a\u0007b' },
        { ...note(), url: `/${'x'.repeat(historyLimits.url)}` },
        { ...note(), url: '/a\tb' },
        { ...note(), data: { text: 'x'.repeat(historyLimits.dataBytes) } },
        { ...note(), data: [1] as never },
        { ...note(), data: { n: Number.POSITIVE_INFINITY } },
      ]
      for (const notification of refused) await expect(store.record(a, notification)).rejects.toThrow()
      expect(await store.list(a, { limit: 10 })).toEqual([])
    })

    it('refuses an empty, undefined or null user id, id or time, touching nothing', async () => {
      const store = await open()
      const kept = await store.record(a, note())
      for (const empty of ['', undefined, null] as unknown as string[]) {
        await expect(store.record(empty, note(2))).rejects.toThrow()
        await expect(store.list(empty, { limit: 10 })).rejects.toThrow()
        await expect(store.countUnread(empty)).rejects.toThrow()
        await expect(store.markRead(empty, kept.id)).rejects.toThrow()
        await expect(store.markRead(a, empty)).rejects.toThrow()
        await expect(store.markAllRead(empty, new Date())).rejects.toThrow()
        await expect(store.markAllRead(a, empty as unknown as Date)).rejects.toThrow()
        await expect(store.removeAllForUser(empty)).rejects.toThrow()
      }
      await expect(store.markAllRead(a, new Date(Number.NaN))).rejects.toThrow()
      expect(await store.list(a, { limit: 10 })).toEqual([kept])
    })
  })
