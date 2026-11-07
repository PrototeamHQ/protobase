import { describe, expect, it } from 'vitest'
import { fakeGmail } from '../../../../test-support/fake-gmail/fake-gmail'
import { mail } from '../../../../test-support/fake-gmail/mail'
import { fakeConnection, pollingRun } from '../../../../test-support/fake-gmail/trigger-context'
import { gmailPlugin } from './plugin'

const trigger = gmailPlugin({ apiUrl: fakeGmail().origin }).triggers.new_mail
const readEndpoints = /^(profile|labels|history|messages|messages\/[0-9a-f]+)$/

const setup = (input: Record<string, unknown> = {}) => {
  const gmail = fakeGmail()
  return { gmail, run: pollingRun(trigger, gmail, { input }) }
}

describe('gmail:new_mail', () => {
  it('starts from the mailbox as it is now, so mail already there starts no run', async () => {
    const { gmail, run } = setup()
    gmail.deliver([mail({ subject: 'Old' })])
    await run.start()
    expect(run.cursor).toMatchObject({ label_id: 'INBOX', history_id: gmail.historyId, offset: 0 })
    expect(await run.poll()).toEqual([])
  })

  it('starts one run per new mail with its sender, recipients, subject, body and attachment names, and none for it again', async () => {
    const { gmail, run } = setup()
    await run.start()
    const [id] = gmail.deliver([mail({ cc: 'Linus <linus@example.com>', html: '<p>Hi there</p>', attachments: [{ filename: 'invoice.pdf', type: 'application/pdf', content: 'pdf bytes' }] })])
    const items = await run.poll()
    expect(items).toEqual([
      {
        key: id,
        data: {
          message_id: id,
          thread_id: id,
          from: { name: 'Ada', address: 'ada@example.com' },
          to: [{ name: 'Grace', address: 'grace@example.com' }],
          cc: [{ name: 'Linus', address: 'linus@example.com' }],
          subject: 'Hello',
          date: '2026-11-05T10:00:00.000Z',
          text: 'Hi there',
          html: '<p>Hi there</p>',
          attachments: [{ filename: 'invoice.pdf', content_type: 'application/pdf', size: 9 }],
          truncated: false,
        },
      },
    ])
    expect(await run.poll()).toEqual([])
    expect(run.cursor).toMatchObject({ history_id: gmail.historyId, offset: 0 })
  })

  it('takes at most 90 mails a poll and the rest on the next, none lost, ending on the mailbox history id', async () => {
    const { gmail, run } = setup()
    await run.start()
    gmail.setPageSize(40)
    const ids = Array.from({ length: 150 }, (_, index) => gmail.deliver([mail({ subject: `Mail ${index}` })])[0]!)
    const first = await run.poll()
    expect(first).toHaveLength(90)
    expect(gmail.callsTo(/^messages\//)).toHaveLength(90)
    const second = await run.poll()
    expect(second).toHaveLength(60)
    expect([...first, ...second].map(({ key }) => key)).toEqual(ids)
    expect(run.cursor).toMatchObject({ history_id: gmail.historyId, offset: 0 })
    expect(await run.poll()).toEqual([])
  })

  it('takes one message of a record of two when one is left of the limit, and the other on the next poll', async () => {
    const { gmail, run } = setup()
    await run.start()
    const before = Array.from({ length: 89 }, () => gmail.deliver([mail()])[0]!)
    const pair = gmail.deliver([mail({ subject: 'One' }), mail({ subject: 'Two' })])
    const first = await run.poll()
    expect(first.map(({ key }) => key)).toEqual([...before, pair[0]])
    expect(run.cursor).toMatchObject({ offset: 1 })
    expect((await run.poll()).map(({ key }) => key)).toEqual([pair[1]])
    expect(await run.poll()).toEqual([])
  })

  it('catches up an expired history from the last full read, at most 90 a poll, on its label alone, each mail once', async () => {
    const { gmail, run } = setup()
    await run.start()
    await run.poll()
    const since = (run.cursor as { polled_at: number }).polled_at
    const ids = Array.from({ length: 150 }, () => gmail.deliver([mail()], { at: since + 30 })[0]!)
    gmail.deliver([mail({ subject: 'Sent' })], { labelIds: ['SENT'], at: since + 30 })
    gmail.expireHistory()
    expect(await run.poll()).toEqual([])
    expect(run.cursor).toMatchObject({ recovery: { since, page_token: null, resume_history_id: gmail.historyId } })
    const recovered: string[] = []
    for (let polls = 0; polls < 2; polls++) {
      const items = await run.poll()
      expect(items.length).toBeLessThanOrEqual(90)
      recovered.push(...items.map(({ key }) => key))
    }
    expect(recovered.sort()).toEqual([...ids].sort())
    expect(gmail.callsTo('messages').every(({ query }) => query.get('labelIds') === 'INBOX' && query.get('q') === `after:${since}`)).toBe(true)
    expect(run.cursor).toMatchObject({ history_id: gmail.historyId, offset: 0 })
    const after = gmail.deliver([mail()])
    expect((await run.poll()).map(({ key }) => key)).toEqual(after)
  })

  it('watches another label by its name', async () => {
    const { gmail, run } = setup({ label: 'Invoices' })
    await run.start()
    expect(run.cursor).toMatchObject({ label_id: 'Label_7' })
    gmail.deliver([mail({ subject: 'Inbox' })])
    const [invoice] = gmail.deliver([mail({ subject: 'Invoice' })], { labelIds: ['INBOX', 'Label_7'] })
    expect((await run.poll()).map(({ key }) => key)).toEqual([invoice])
    await expect(pollingRun(trigger, gmail, { input: { label: 'Nope' } }).start()).rejects.toThrow('The mailbox has no label "Nope"')
  })

  it('starts runs only for mail passing every filter set, a read counting toward the limit either way', async () => {
    const { gmail, run } = setup({ from: 'ADA@', subject: 'invoice' })
    await run.start()
    const [match] = gmail.deliver([mail({ subject: 'Your Invoice' })])
    gmail.deliver([mail({ subject: 'Lunch?' })])
    gmail.deliver([mail({ from: 'Bob <bob@example.com>', subject: 'invoice' })])
    gmail.deliver([mail({ from: '', subject: 'invoice' })])
    expect((await run.poll()).map(({ key }) => key)).toEqual([match])
    expect(gmail.callsTo(/^messages\//)).toHaveLength(4)

    const recipients = setup({ to: 'linus' })
    await recipients.run.start()
    const [cc] = recipients.gmail.deliver([mail({ cc: 'linus@example.com' })])
    recipients.gmail.deliver([mail()])
    expect((await recipients.run.poll()).map(({ key }) => key)).toEqual([cc])
  })

  it('skips a mail deleted since it was listed, and starts one run for a message listed twice', async () => {
    const { gmail, run } = setup()
    await run.start()
    const [gone] = gmail.deliver([mail()])
    const [kept] = gmail.deliver([mail()])
    gmail.remove(gone!)
    expect((await run.poll()).map(({ key }) => key)).toEqual([kept])

    const twice = setup()
    await twice.run.start()
    const [id] = twice.gmail.deliver([mail()])
    twice.gmail.failNext(/^history$/, { status: 200, body: { history: [1, 2].map((n) => ({ id: String(Number(twice.gmail.historyId) + n), messagesAdded: [{ message: { id, threadId: id } }] })), historyId: twice.gmail.historyId } })
    expect((await twice.run.poll()).map(({ key }) => key)).toEqual([id])
  })

  it('gives the same runs when a poll is made again from the same cursor, as after a crash before it was saved', async () => {
    const { gmail, run } = setup()
    await run.start()
    gmail.deliver([mail()])
    gmail.deliver([mail()])
    const cursor = run.cursor
    const first = await run.poll()
    run.cursor = cursor
    expect(await run.poll()).toEqual(first)
  })

  it('calls only the read endpoints, with GET, over a start, a poll and a recovery', async () => {
    const { gmail, run } = setup({ label: 'Invoices' })
    await run.start()
    gmail.deliver([mail()], { labelIds: ['Label_7'] })
    await run.poll()
    gmail.expireHistory()
    gmail.deliver([mail()], { labelIds: ['Label_7'], at: 1_900_000_000 })
    await run.poll()
    await run.poll()
    expect(gmail.calls.length).toBeGreaterThan(5)
    expect(gmail.calls.every(({ method, path }) => method === 'GET' && readEndpoints.test(path))).toBe(true)
    expect(gmail.calls.every(({ origin }) => origin === gmail.origin)).toBe(true)
    expect(gmailPlugin().connections.google.scopes).toEqual(['https://www.googleapis.com/auth/gmail.readonly'])
  })

  it('makes no Gmail call when the connection gives no token, and passes its error on', async () => {
    const gmail = fakeGmail()
    const failing = { accessToken: () => Promise.reject(new Error('The token endpoint answered 500')) }
    await expect(pollingRun(trigger, gmail, { connection: failing }).start()).rejects.toThrow('The token endpoint answered 500')
    const run = pollingRun(trigger, gmail, { connection: failing })
    run.cursor = { label_id: 'INBOX', history_id: '1000', offset: 0, polled_at: 0 }
    await expect(run.poll()).rejects.toThrow('The token endpoint answered 500')
    expect(gmail.calls).toEqual([])
  })

  it('puts the token in no item, no cursor, no error and no URL, only in the Authorization header', async () => {
    const gmail = fakeGmail()
    gmail.tokens.add('secret-access-token')
    const run = pollingRun(trigger, gmail, { connection: fakeConnection('stale-secret-token', 'secret-access-token') })
    await run.start()
    gmail.deliver([mail()])
    const items = await run.poll()
    gmail.failNext(/^history$/, gmail.googleError(500, 'INTERNAL', 'Backend error'))
    const error = await run.poll().then(() => undefined, (error: unknown) => error as Error)
    gmail.tokens.delete('secret-access-token')
    const expired = await run.poll().then(() => undefined, (error: unknown) => error as Error)
    const shown = JSON.stringify([items, run.cursor, error?.message, expired?.message, gmail.calls.map(({ path, query }) => `${path}?${query}`)])
    expect(items).toHaveLength(1)
    expect(error?.message).toBe('Gmail history.list answered 500 (INTERNAL)')
    expect(shown).not.toContain('secret')
    expect(new Set(gmail.calls.map(({ token }) => token))).toEqual(new Set(['stale-secret-token', 'secret-access-token']))
  })

  it('fails a poll whose cursor it cannot read, rather than guessing where to go on', async () => {
    const { run } = setup()
    for (const cursor of [null, { label_id: 'INBOX', history_id: '1 OR 2', offset: 0, polled_at: 0 }, { label_id: 'INBOX in:anywhere', history_id: '1', offset: 0, polled_at: 0 }, { label_id: 'INBOX', polled_at: 0, recovery: { since: '0 OR x', page_token: null, resume_history_id: '1' } }]) {
      run.cursor = cursor
      await expect(run.poll()).rejects.toThrow('The Gmail trigger has a cursor it cannot read')
    }
  })

  it('polls every minute with the token of its own connection', () => {
    expect(trigger).toMatchObject({ kind: 'polling', every: '1 minute', limit: 90, connection: 'google' })
    expect(fakeConnection('a').asked()).toBe(0)
  })
})
