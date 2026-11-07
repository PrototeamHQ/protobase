import type { HistoryRecord, MessageRef } from './calls'

/** One page of history after a start, as `historyPage` gives it. */
export type HistoryPage = { records: HistoryRecord[]; next: string | undefined; historyId: string }

/** The most pages one poll reads: each holds at least one record, so a poll of up to 100 messages needs fewer. */
export const pagesPerPoll = 10

/**
 * The first `limit` messages added after `start`, skipping `offset` messages of its first record, and where the next
 * walk starts: inside a record, the record before it (or `start`) with the messages of it now taken; at a record's end,
 * that record; after the last record of the last page, the mailbox's current history id, the only place it is used,
 * and `caughtUp`.
 */
export const walkHistory = async (read: (page: string | undefined) => Promise<HistoryPage>, start: string, offset: number, limit: number) => {
  const taken: MessageRef[] = []
  let before = start
  let skip = offset
  let page: string | undefined
  for (let pages = 0; pages < pagesPerPoll; pages++) {
    const answer = await read(page)
    for (const [index, record] of answer.records.entries()) {
      const left = record.added.slice(skip)
      const room = limit - taken.length
      if (left.length > room) {
        taken.push(...left.slice(0, room))
        return { taken, history_id: before, offset: skip + room, caughtUp: false }
      }
      taken.push(...left)
      before = record.id
      skip = 0
      const last = index === answer.records.length - 1 && answer.next === undefined
      if (taken.length === limit && !last) return { taken, history_id: record.id, offset: 0, caughtUp: false }
    }
    if (answer.next === undefined) return { taken, history_id: answer.historyId, offset: 0, caughtUp: true }
    page = answer.next
  }
  // Pages without a record would be a broken answer; the next poll goes on from the last record taken.
  return { taken, history_id: before, offset: skip, caughtUp: false }
}
