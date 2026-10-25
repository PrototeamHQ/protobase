import { historyPath } from '@protobase/schema/internal'
import type { Transport } from './transport'

/**
 * One of the signed-in user's inbox notifications, as the server answers it: `title` and `body` are plain text, `url` a
 * path on the app or an absolute URL on one of its origins, or `null`; `readAt` is `null` while it is unread.
 */
export type InboxNotification = { id: string; title: string; body: string | null; url: string | null; data: Record<string, unknown> | null; createdAt: string; readAt: string | null }

/** A page of the history, newest first; `next` is the cursor of the page after it, `null` on the last one. */
export type InboxPage = { items: InboxNotification[]; next: string | null }

/**
 * The signed-in user's own notification history (`/api/notifications/history`): `list` a page of it, `unread` how many
 * are unread (at most 100), `markRead` one of them by its id, and `markAllRead` those created up to `upTo`, the
 * `createdAt` of the newest one the user was shown.
 */
export const notificationHistoryClient = (send: Transport) => ({
  list: async ({ cursor, limit }: { cursor?: string; limit?: number } = {}): Promise<InboxPage> => {
    const params = new URLSearchParams({ ...(cursor !== undefined && { cursor }), ...(limit !== undefined && { limit: String(limit) }) })
    const query = params.size > 0 ? `?${params}` : ''
    return (await send({ method: 'GET', path: historyPath(''), query, system: true })).json() as Promise<InboxPage>
  },
  unread: async (): Promise<number> => ((await (await send({ method: 'GET', path: historyPath('', 'unread'), system: true })).json()) as { count: number }).count,
  markRead: async (id: string) => {
    await send({ method: 'POST', path: historyPath('', { read: id }), body: {}, system: true })
  },
  markAllRead: async (upTo: string) => {
    await send({ method: 'POST', path: historyPath('', 'read'), body: { upTo }, system: true })
  },
})

export type NotificationHistoryClient = ReturnType<typeof notificationHistoryClient>
