import { describe, expect, it } from 'vitest'
import { pagesPerPoll, walkHistory, type HistoryPage } from './history-walk'

// History pages as given, one a read; past the last, the last again.
const pages = (...answers: HistoryPage[]) => {
  let reads = 0
  const read = async () => answers[Math.min(reads++, answers.length - 1)]!
  return { read, reads: () => reads }
}

const record = (id: number, ...messages: string[]) => ({ id: String(id), added: messages.map((message) => ({ id: message, threadId: message })) })

describe('walkHistory', () => {
  it('ends at the mailbox history id once the last page is read', async () => {
    const history = pages({ records: [record(11, 'a'), record(12, 'b')], next: 'p2', historyId: '20' }, { records: [record(13, 'c')], next: undefined, historyId: '20' })
    expect(await walkHistory(history.read, '10', 0, 90)).toEqual({ taken: ['a', 'b', 'c'].map((id) => ({ id, threadId: id })), history_id: '20', offset: 0, caughtUp: true })
  })

  it(`reads at most ${pagesPerPoll} pages a poll when every page points to another, and stays where it was`, async () => {
    const history = pages({ records: [], next: 'again', historyId: '99' })
    expect(await walkHistory(history.read, '10', 2, 90)).toEqual({ taken: [], history_id: '10', offset: 2, caughtUp: false })
    expect(history.reads()).toBe(pagesPerPoll)
  })

  it('goes on from the last record it took once the pages run out', async () => {
    const history = pages({ records: [record(11, 'a')], next: 'p2', historyId: '99' }, { records: [], next: 'again', historyId: '99' })
    expect(await walkHistory(history.read, '10', 0, 90)).toMatchObject({ taken: [{ id: 'a' }], history_id: '11', offset: 0, caughtUp: false })
  })

  it('stops inside a record at the limit, counting what it took of it', async () => {
    const history = pages({ records: [record(11, 'a', 'b', 'c')], next: undefined, historyId: '20' })
    expect(await walkHistory(history.read, '10', 1, 1)).toEqual({ taken: [{ id: 'b', threadId: 'b' }], history_id: '10', offset: 2, caughtUp: false })
  })
})
