import { Hono } from 'hono'
import { streamSSE, type SSEStreamingApi } from 'hono/streaming'
import { z } from 'zod'
import { parseParams } from '../params'
import type { AdminEnv, Session } from '../types'
import type { NoticeFeed } from './notice-feed'
import type { Notice } from './notices-sql'

/**
 * What the stream sends, each event's data: `current` when the page has heard of every change up to `cursor`, also
 * every 25 seconds; `changes` with the records that changed; `resync` when it missed some and reads everything it
 * shows again. Send the last `cursor` back as `after` when connecting again.
 */
export type LiveEvent =
  | { type: 'current'; cursor: string }
  | { type: 'resync'; cursor: string }
  | { type: 'changes'; cursor: string; changes: Array<Pick<Notice, 'resource' | 'key' | 'operation'>> }

const params = z.object({ after: z.string().regex(/^\d+$/, 'Use the cursor of an earlier event').optional() })

/** Notices a reconnecting page catches up on at most; one that missed more reads everything again. */
const replayLimit = 1000

const heartbeatMs = 25_000

const later = (id: string, than: string) => BigInt(id) > BigInt(than)

/**
 * `GET /live`: the changes of the live resources the caller may read, as they come, keys only. `visibleTo` says which
 * notices a caller hears of (`visibleNotices`).
 */
export const liveRoutes = (feed: NoticeFeed, visibleTo: (session: Session) => Promise<(notice: Notice) => boolean>) => {
  const app = new Hono<AdminEnv>()
  app.get('/live', async (c) => {
    const { after } = parseParams(params, c.req.query())
    const visible = await visibleTo(c.get('session'))
    const changesOf = (notices: Notice[]) => notices.filter(visible).map(({ resource, key, operation }) => ({ resource, key, operation }))
    const queue: LiveEvent[] = []
    let wake = () => {}
    const held: Notice[] = []
    let deliver = (notices: Notice[]) => void held.push(...notices)
    let heartbeat: ReturnType<typeof setInterval> | undefined
    let stop = () => {}

    const follow = async (stream: SSEStreamingApi) => {
      stream.onAbort(() => wake())
      const subscription = await feed.subscribe((notices) => deliver(notices))
      stop = subscription.stop
      // Subscribed first, so the notices up to the feed's cursor are caught up on and the later ones come live.
      const caught = after === undefined ? [] : await feed.replay(after, subscription.cursor, replayLimit)
      // The last notice the page has accounted for, heard of or not.
      let cursor = after !== undefined && caught && later(after, subscription.cursor) ? after : subscription.cursor
      if (!caught) queue.push({ type: 'resync', cursor })
      else if (changesOf(caught).length > 0) queue.push({ type: 'changes', cursor, changes: changesOf(caught) })
      else queue.push({ type: 'current', cursor })
      deliver = (notices) => {
        const fresh = notices.filter((notice) => later(notice.id, cursor))
        if (fresh.length === 0) return
        cursor = fresh.at(-1)!.id
        const changes = changesOf(fresh)
        if (changes.length > 0) queue.push({ type: 'changes', cursor, changes })
        wake()
      }
      deliver(held)
      heartbeat = setInterval(() => {
        queue.push({ type: 'current', cursor })
        wake()
      }, heartbeatMs)
      while (!stream.aborted) {
        const event = queue.shift()
        if (event) await stream.writeSSE({ data: JSON.stringify(event) })
        else await new Promise<void>((resolve) => (wake = resolve))
      }
    }

    return streamSSE(c, (stream) =>
      follow(stream).finally(() => {
        clearInterval(heartbeat)
        stop()
      }),
    )
  })
  return app
}
