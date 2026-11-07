import { ConnectionError } from '@protobase/workflows/plugin'
import { describe, expect, it } from 'vitest'
import { recordedOrigin, recording, replayFetch } from '../../../../test-support/fake-gmail/recordings'
import { fakeConnection } from '../../../../test-support/fake-gmail/trigger-context'
import { gmailApi, GmailNotFound } from './api'
import { historyPage, labels, messageHeaders, messagesPage, profile } from './calls'
import type { LiveCursor } from './cursor'
import { newMailTrigger } from './new-mail'
import { readMessage } from './read-message'

// The trigger's calls on the answers recorded from a real Gmail mailbox, which held one test mail.

const signal = new AbortController().signal
const api = (connection = fakeConnection('token-1')) => gmailApi({ origin: recordedOrigin, fetch: replayFetch(), connection, signal })
const query = (name: Parameters<typeof recording>[0], key: string) => recording(name).request.query.find(([name]) => name === key)![1]
const testMail = recording('messages').response.body as { messages: [{ id: string; threadId: string }] }
const ref = testMail.messages[0]

describe('the Gmail trigger on recorded answers', () => {
  it("reads the mailbox's history id and labels", async () => {
    expect(await profile(api())).toBe((recording('profile').response.body as { historyId: string }).historyId)
    expect(await labels(api())).toContainEqual({ id: 'INBOX', name: 'INBOX' })
  })

  it('finds the test mail in the history after where it stood, and on the label since a time', async () => {
    const page = await historyPage(api(), { start: query('history', 'startHistoryId'), label: 'INBOX', page: undefined })
    expect(page.records.flatMap(({ added }) => added)).toEqual([ref])
    expect(page.next).toBeUndefined()
    const listed = await messagesPage(api(), { label: 'INBOX', since: Number(query('messages', 'q').replace('after:', '')), page: undefined, limit: 100 })
    expect(listed).toEqual({ messages: [ref], next: undefined })
  })

  it('reads the test mail whole, and its headers alone', async () => {
    expect(await readMessage(api(), ref)).toEqual({
      message_id: ref.id,
      thread_id: ref.threadId,
      from: { name: 'Ada', address: 'ada@example.com' },
      to: [{ name: 'Mailbox', address: 'mailbox@example.com' }],
      cc: [],
      subject: 'Invoice 7',
      date: expect.any(String),
      text: 'The invoice is attached.',
      html: '<p>The invoice is attached.</p>',
      attachments: [{ filename: 'invoice-7.txt', content_type: 'text/plain', size: 9 }],
      truncated: false,
    })
    expect(await messageHeaders(api(), ref.id)).toEqual(expect.arrayContaining([{ name: 'From', value: 'Ada <ada@example.com>' }, { name: 'Subject', value: 'Invoice 7' }]))
  })

  it("takes Gmail's 404 for a message it has not, and gives up on its 401 twice as an expired sign-in", async () => {
    await expect(api().get('messages/0000000000000000', [['format', 'raw']], 'messages.get')).rejects.toBeInstanceOf(GmailNotFound)
    const refused = await profile(api(fakeConnection('refused-token'))).catch((error: unknown) => error)
    expect(refused).toBeInstanceOf(ConnectionError)
    expect((refused as ConnectionError).code).toBe('link_expired')
  })

  it('starts one run for the test mail, polled from the history before it', async () => {
    const trigger = newMailTrigger(recordedOrigin)
    const context = { input: {}, connection: fakeConnection('token-1'), fetch: replayFetch(), signal }
    expect(await trigger.start(context)).toMatchObject({ label_id: 'INBOX', history_id: await profile(api()) })
    const cursor: LiveCursor = { label_id: 'INBOX', history_id: query('history', 'startHistoryId'), offset: 0, polled_at: 0 }
    const polled = await trigger.poll({ ...context, cursor, store: undefined, limit: 90, due: new Date() })
    expect(polled.items).toEqual([{ key: ref.id, data: expect.objectContaining({ subject: 'Invoice 7' }) }])
  })

  it('reaches nothing but the recordings: another call or host throws instead of going out', async () => {
    const fetch = replayFetch()
    for (const url of ['https://oauth2.googleapis.com/token', 'https://accounts.google.com/o/oauth2/revoke', 'https://developers.google.com/oauthplayground', 'https://www.googleapis.com/oauth2/v3/userinfo']) await expect(fetch(url)).rejects.toThrow('No recording answers')
    await expect(fetch(`${recordedOrigin}/gmail/v1/users/me/messages/1234`, { headers: { authorization: 'Bearer token-1' } })).rejects.toThrow('No recording answers')
  })
})
