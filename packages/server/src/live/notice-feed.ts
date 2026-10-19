import type { Db } from '@protobase/query'
import { lastNotice, noticeKept, noticesAfter, type Notice } from './notices-sql'

/**
 * Where a process hears of the changes open pages refresh from. The notices table is the one backend today; another,
 * such as Redis, fits behind the same three calls.
 */
export type NoticeFeed = {
  /**
   * Calls `listener` with each batch of notices that comes in, in order, until `stop`. `cursor` is the last notice
   * before the first batch: what a page that connects now has seen.
   */
  subscribe: (listener: (notices: Notice[]) => void) => Promise<{ cursor: string; stop: () => void }>
  /** The notices after `after` up to `upTo`, or `undefined` when some were pruned or there are more than `limit`. */
  replay: (after: string, upTo: string, limit: number) => Promise<Notice[] | undefined>
}

export type TableFeedOptions = {
  db: Db
  /** The schema of the notices table (`EventsOptions.schema`). */
  schema: string
  /** How often the table is read while a page listens. */
  intervalMs?: number
  /** Where a failed read goes; the next one tries again. */
  report: (error: unknown) => void
}

/** Notices read from a batch at most. */
const batchSize = 1000

const after = (id: string, than: string) => BigInt(id) > BigInt(than)

/**
 * The notices table, read once every `intervalMs` by this process while at least one page listens, however many do:
 * the cost of open pages is one indexed query a second per process.
 */
export const tableFeed = ({ db, schema, intervalMs = 1000, report }: TableFeedOptions): NoticeFeed => {
  const listeners = new Set<(notices: Notice[]) => void>()
  // The last notice read, while the table is read; undefined while no page listens.
  let cursor: Promise<string> | undefined

  const read = async (from: string) => {
    for (;;) {
      const notices = await noticesAfter(db, schema, from, batchSize)
      if (notices.length === 0) return from
      from = notices.at(-1)!.id
      for (const listener of listeners) listener(notices)
      if (notices.length < batchSize) return from
    }
  }

  // A failed read keeps the cursor, so the next one reads the same notices again.
  const tick = async (last: string) => {
    if (listeners.size === 0) {
      cursor = undefined
      return
    }
    cursor = read(last).catch((error: unknown) => {
      report(error)
      return last
    })
    const next = await cursor
    setTimeout(() => void tick(next), intervalMs)
  }

  const start = () => {
    const first = lastNotice(db, schema)
    cursor = first
    first.then(
      (last) => setTimeout(() => void tick(last), intervalMs),
      () => (cursor = undefined),
    )
    return first
  }

  return {
    subscribe: (listener) => {
      listeners.add(listener)
      const stop = () => void listeners.delete(listener)
      return (cursor ?? start()).then(
        (at) => ({ cursor: at, stop }),
        (error: unknown) => {
          stop()
          throw error
        },
      )
    },
    replay: async (from, upTo, limit) => {
      if (!(await noticeKept(db, schema, from))) return undefined
      if (!after(upTo, from)) return []
      const notices = (await noticesAfter(db, schema, from, limit + 1)).filter((notice) => !after(notice.id, upTo))
      return notices.length > limit ? undefined : notices
    },
  }
}
