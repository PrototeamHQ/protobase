import { describe, expect, it } from 'vitest'
import { fakeGmail } from '../../../../test-support/fake-gmail/fake-gmail'
import { fakeConnection } from '../../../../test-support/fake-gmail/trigger-context'
import { gmailApi } from './api'
import { historyPage, messagesPage } from './calls'

const setup = () => {
  const gmail = fakeGmail()
  return { gmail, api: gmailApi({ origin: gmail.origin, fetch: gmail.fetch, connection: fakeConnection('token-1'), signal: new AbortController().signal }) }
}

describe('Gmail answers', () => {
  it('refuses a message id that would steer a later request to another path', async () => {
    for (const id of ['../../profile', 'a/b', 'a?format=full', '']) {
      const { gmail, api } = setup()
      gmail.failNext(/^history$/, { status: 200, body: { history: [{ id: '1001', messagesAdded: [{ message: { id, threadId: 'abc' } }] }], historyId: '1001' } })
      await expect(historyPage(api, { start: '1000', label: 'INBOX', page: undefined })).rejects.toThrow('Gmail history.list answered an unexpected shape')
    }
  })

  it('refuses a history id or page token of the wrong shape', async () => {
    const { gmail, api } = setup()
    gmail.failNext(/^history$/, { status: 200, body: { historyId: '1 OR 2' } })
    await expect(historyPage(api, { start: '1000', label: 'INBOX', page: undefined })).rejects.toThrow('unexpected shape')
    gmail.failNext(/^messages$/, { status: 200, body: { messages: [], nextPageToken: 'x'.repeat(1001) } })
    await expect(messagesPage(api, { label: 'INBOX', since: 0, page: undefined, limit: 90 })).rejects.toThrow('unexpected shape')
  })

  it('builds every query from checked values alone', async () => {
    const { gmail, api } = setup()
    await messagesPage(api, { label: 'INBOX', since: 1_800_000_000, page: 'page-5', limit: 90 })
    expect(Object.fromEntries(gmail.calls[0]!.query)).toEqual({ labelIds: 'INBOX', q: 'after:1800000000', maxResults: '90', pageToken: 'page-5' })
  })
})
