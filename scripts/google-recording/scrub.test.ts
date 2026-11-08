import { describe, expect, it } from 'vitest'
import { findLeak, mailboxPlaceholder, onlyTestMail, rebuildRaw, scrubGmail, scrubLabels, scrubProfile, scrubTokens } from './scrub'

// Made-up values in the shapes of the real ones; none is a credential.
const mailbox = 'someone.real@mailbox.test'
const accessToken = 'ya29.a0-made-up-access'
const refreshToken = '1//0g-made-up-refresh'
const clientSecret = 'GOCSPX-made-up-secret'
const raw = (lines: string[]) => Buffer.from(lines.join('\r\n')).toString('base64url') + '='
const decoded = (value: string) => Buffer.from(value, 'base64url').toString('latin1')

const gmailRaw = raw([
  `Received: from 10.0.0.1 by mx.mailbox.test for <${mailbox}>; Sat, 07 Nov 2026 08:00:00 +0000`,
  `Delivered-To: ${mailbox}`,
  `Return-Path: <${mailbox}>`,
  'X-GM-MSGID: 1790000000000000000',
  'X-Google-Smtp-Source: AGHT+IF-made-up',
  'DKIM-Signature: v=1; a=rsa-sha256; d=mailbox.test;',
  '\tb=made-up',
  'ARC-Seal: i=1; a=rsa-sha256; t=1;',
  'From: Ada <ada@example.com>',
  `To: Mailbox <${mailbox}>`,
  'Subject: Invoice 7',
  'Content-Type: text/plain; charset=utf-8',
  '',
  `Hello ${mailbox}`,
])

describe('the recording scrub', () => {
  it("rebuilds a mail from the kept headers alone, naming those Gmail added, with the mailbox's address replaced", () => {
    const rebuilt = rebuildRaw(gmailRaw, mailbox)
    expect(decoded(rebuilt.raw)).toBe(['From: Ada <ada@example.com>', `To: Mailbox <${mailboxPlaceholder}>`, 'Subject: Invoice 7', 'Content-Type: text/plain; charset=utf-8', '', `Hello ${mailboxPlaceholder}`].join('\r\n'))
    expect(rebuilt.dropped).toEqual(['Received', 'Delivered-To', 'Return-Path', 'X-GM-MSGID', 'X-Google-Smtp-Source', 'DKIM-Signature', 'ARC-Seal'])
    expect(findLeak({ raw: rebuilt.raw }, [mailbox])).toBeUndefined()
  })

  it('pads a rebuilt mail as Gmail pads its own, so it decodes', () => {
    const { raw: rebuilt } = rebuildRaw(gmailRaw, mailbox)
    expect(rebuilt.length % 4).toBe(0)
    expect(() => atob(rebuilt.replaceAll('-', '+').replaceAll('_', '/'))).not.toThrow()
  })

  it("replaces the mailbox's address everywhere in an answer, in any case, and keeps a metadata answer's kept headers alone", () => {
    const body = { snippet: `to ${mailbox.toUpperCase()}`, payload: { mimeType: 'text/plain', headers: [{ name: 'To', value: mailbox }, { name: 'Delivered-To', value: mailbox }] } }
    const { body: scrubbed, dropped } = scrubGmail(body, mailbox)
    expect(scrubbed).toEqual({ snippet: `to ${mailboxPlaceholder}`, payload: { mimeType: 'text/plain', headers: [{ name: 'To', value: mailboxPlaceholder }] } })
    expect(dropped).toEqual(['Delivered-To'])
  })

  it('keeps the placeholder address and no mail counts of the profile, and only the system labels', () => {
    expect(scrubProfile({ emailAddress: mailbox, messagesTotal: 812, threadsTotal: 640, historyId: '5314' })).toEqual({ emailAddress: mailboxPlaceholder, messagesTotal: 1, threadsTotal: 1, historyId: '5314' })
    expect(scrubLabels({ labels: [{ id: 'INBOX', type: 'system' }, { id: 'Label_1', name: 'Divorce lawyer', type: 'user' } as never] })).toEqual({ labels: [{ id: 'INBOX', type: 'system' }] })
  })

  it('puts a placeholder in every token field of a token answer', () => {
    const answer = { access_token: accessToken, refresh_token: refreshToken, id_token: 'eyJ.made.up', expires_in: 3599, scope: 'gmail.readonly' }
    expect(scrubTokens(answer, { access_token: 'snapshot-access_token-2' })).toEqual({ access_token: 'snapshot-access_token-2', refresh_token: 'snapshot-refresh_token-1', id_token: 'snapshot-id_token-1', expires_in: 3599, scope: 'gmail.readonly' })
  })

  it('finds a secret value, a token shape or an address off example.com anywhere, by kind and never by value', () => {
    expect(findLeak({ request: { query: [['q', 'made-up-secret-value']] } }, ['made-up-secret-value'])).toBe('a secret value')
    for (const value of [accessToken, refreshToken, clientSecret, '1234-made-up.apps.googleusercontent.com']) expect(findLeak({ headers: { authorization: `Bearer ${value}` } }, [])).toBe('a Google token or client shape')
    expect(findLeak({ url: `https://gmail.googleapis.com/x?token=${accessToken}` }, [])).toBe('a Google token or client shape')
    expect(findLeak({ raw: raw([`Delivered-To: ${mailbox}`, '', 'hi']) }, [])).toBe('an address off example.com')
    expect(findLeak({ raw: raw(['X-Token: GOCSPX-in-raw', '', 'hi']) }, [])).toBe('a Google token or client shape')
    expect(findLeak({ [mailbox]: 1 }, [])).toBe('an address off example.com')
    expect(findLeak({ from: 'Ada <ada@example.com>', status: 'NOT_FOUND' }, [])).toBeUndefined()
  })

  it('fails on a message or thread other than the test mail, wherever an answer names it', () => {
    const mail = { id: 'aaa', threadId: 'aaa' }
    expect(() => onlyTestMail('history.list', { history: [{ id: '5', messages: [mail], messagesAdded: [{ message: { ...mail, labelIds: ['INBOX'] } }] }] }, mail)).not.toThrow()
    expect(() => onlyTestMail('messages.list', { messages: [mail, { id: 'bbb', threadId: 'bbb' }] }, mail)).toThrow('lists a message other than the test mail')
    expect(() => onlyTestMail('history.list', { history: [{ id: '5', labelsAdded: [{ message: { id: 'bbb', threadId: 'bbb' }, labelIds: ['STARRED'] }] }] }, mail)).toThrow('lists a message other')
    expect(() => onlyTestMail('history.list', { history: [{ id: '5', messages: [{ id: 'aaa', threadId: 'ccc' }] }] }, mail)).toThrow('lists a thread other')
    expect(() => onlyTestMail('messages.get', { id: 'aaa', threadId: 'ddd' }, mail)).toThrow('lists a thread other')
  })
})
