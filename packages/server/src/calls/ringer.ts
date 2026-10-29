import type { CallRing } from '@protobase/schema/internal'
import type { CallRingInput } from './call-ring'
import type { CallRecord } from './call-store'
import type { RingStore } from './ring-store'

/** How long a call rings the people it names, unless they answer or decline first, or it ends. */
export const ringSeconds = 30

/** The bell's entry of a ring, sent to every user it names, also to those on do not disturb. */
export type RingNotification = { userIds: string[]; title: string; body?: string; url?: string; data: { call: string; resource: string; key: string } }

/**
 * The bell's entry and push of a ring: urgent, kept by push services no longer than a minute, and tagged by its call,
 * its id without hyphens as a push tag takes it, so the call's later pushes replace it.
 */
export const ringMessage = ({ title, body, url, data }: Omit<RingNotification, 'userIds'>) => ({
  title,
  ...(body !== undefined && { body }),
  ...(url !== undefined && { url }),
  data,
  urgency: 'high' as const,
  ttl: 60,
  tag: data.call.replaceAll('-', ''),
})

export type RingerInput = {
  store: RingStore
  /** The users on do not disturb of these, with `status`: they are not rung, and keep the ring in their bell. */
  doNotDisturb?: (userIds: readonly string[]) => Promise<Set<string>>
  /** Sends the bell's entry, with notifications: their push job holds the push of someone on do not disturb. */
  notify?: (notification: RingNotification) => Promise<void>
  /** The record's page in the app, as an absolute URL, where a ring's entry leads by default; none without the app's address. */
  recordUrl: (record: CallRecord) => string | undefined
}

/**
 * The rings of calls: started when a join starts a call with a `ring`, stopped for a user once they join the call or
 * decline it, and for everyone once the call ends. Each change reaches the user's open pages as a live notice.
 */
export const ringer = ({ store, doNotDisturb, notify, recordUrl }: RingerInput) => ({
  start: async (call: string, record: CallRecord, by: string, ring: CallRingInput) => {
    const named = [...new Set(ring.users)].filter((user) => user !== by)
    if (named.length === 0) return
    const quiet = doNotDisturb ? await doNotDisturb(named) : new Set<string>()
    const rung = await store.start(call, named.filter((user) => !quiet.has(user)), { title: ring.title, body: ring.body ?? null }, ringSeconds)
    await store.notice(rung)
    const url = ring.url ?? recordUrl(record)
    await notify?.({ userIds: named, title: ring.title, ...(ring.body !== undefined && { body: ring.body }), ...(url !== undefined && { url }), data: { call, resource: record.resource, key: record.key } })
  },
  /** The user joined the call, or declined it: it rings them no more, on any page. */
  stop: async (call: string, userId: string) => {
    if (await store.stop(call, userId)) await store.notice([userId])
  },
  /** Stops the rings of the calls that ended. */
  settle: async () => store.notice(await store.stopEnded()),
  of: (userId: string): Promise<CallRing[]> => store.of(userId),
})

export type Ringer = ReturnType<typeof ringer>
