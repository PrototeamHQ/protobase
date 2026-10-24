import { describe, expect, it } from 'vitest'
import { checkedSend, maxMessageBytes, maxRecipients, NotificationSendError } from './send-input'

const refused = (to: unknown, message: unknown, field: string) => {
  const thrown = (() => {
    try {
      checkedSend(to, message)
    } catch (error) {
      return error
    }
  })()
  expect(thrown).toBeInstanceOf(NotificationSendError)
  expect((thrown as NotificationSendError).field).toBe(field)
}

const users = { userIds: ['u1'], inbox: true }

describe('checkedSend', () => {
  it('takes a user send with its inbox flag and a device send, each id once', () => {
    expect(checkedSend({ userIds: ['u1', 'u2', 'u1'], inbox: false }, { title: 'Hi' })).toEqual({ to: { userIds: ['u1', 'u2'], inbox: false }, message: { title: 'Hi' } })
    expect(checkedSend({ deviceIds: ['d1'] }, { title: 'Hi' })).toEqual({ to: { deviceIds: ['d1'] }, message: { title: 'Hi' } })
  })

  it.each([
    'JavaScript:alert(1)',
    'javascript:alert(1)',
    'java\tscript:alert(1)',
    '\njavascript:alert(1)',
    ' javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'blob:https://app.example/uuid',
    'file:///etc/passwd',
    'https://',
    '//evil.example/x',
    '/\\evil.example/x',
    '/tasks/1',
  ])('refuses the url %j before anything is queued', (url) => {
    refused(users, { title: 'Hi', url }, 'message.url')
  })

  it('refuses a url that is not a string, such as an array or an object that changes what it says', () => {
    let calls = 0
    const changing = { toString: () => (calls++ === 0 ? 'https://app.example/' : 'javascript:alert(1)') }
    refused(users, { title: 'Hi', url: ['https://app.example/'] }, 'message.url')
    refused(users, { title: 'Hi', url: changing }, 'message.url.toString')
    expect(calls).toBe(0)
  })

  it('keeps an https url on another origin as the parser writes it', () => {
    expect(checkedSend(users, { title: 'Hi', url: 'HTTPS://Other.Example:443/a/../b' }).message.url).toBe('https://other.example/b')
  })

  it.each(['actions', 'href', 'link', 'userId'])('refuses a message field it does not take: %s', (field) => {
    refused(users, { title: 'Hi', [field]: 'https://evil.example/' }, `message.${field}`)
  })

  it.each([['"false"', 'false'], ['"true"', 'true'], ['0', 0], ['1', 1], ['null', null], ['nothing', undefined]])('refuses an inbox flag of %s on a user send', (_name, inbox) => {
    refused({ userIds: ['u1'], ...(inbox !== undefined && { inbox }) }, { title: 'Hi' }, 'to.inbox')
  })

  it('refuses an inbox flag on a device send, and a send naming both users and devices', () => {
    refused({ deviceIds: ['d1'], inbox: false }, { title: 'Hi' }, 'to.inbox')
    refused({ userIds: ['u1'], deviceIds: ['d1'], inbox: true }, { title: 'Hi' }, 'to')
    refused({}, { title: 'Hi' }, 'to')
    refused(null, { title: 'Hi' }, 'to')
    refused({ userIds: ['u1'], inbox: true, everyone: true }, { title: 'Hi' }, 'to.everyone')
  })

  it('refuses no ids, too many, and ids that are not text a store takes', () => {
    refused({ userIds: [], inbox: true }, { title: 'Hi' }, 'to.userIds')
    refused({ userIds: Array.from({ length: maxRecipients + 1 }, (_, n) => `u${n}`), inbox: true }, { title: 'Hi' }, 'to.userIds')
    refused({ userIds: [''], inbox: true }, { title: 'Hi' }, 'to.userIds')
    refused({ userIds: [1], inbox: true }, { title: 'Hi' }, 'to.userIds')
    refused({ deviceIds: ['d\n1'] }, { title: 'Hi' }, 'to.deviceIds')
    refused({ deviceIds: 'd1' }, { title: 'Hi' }, 'to.deviceIds')
  })

  it('refuses a message over its size, and one for the inbox that the history would not keep', () => {
    refused({ deviceIds: ['d1'] }, { title: 'Hi', data: { text: 'x'.repeat(maxMessageBytes) } }, 'message')
    refused(users, { title: 'Hi', data: { text: 'x'.repeat(5000) } }, 'message.data')
    expect(checkedSend({ userIds: ['u1'], inbox: false }, { title: 'Hi', data: { text: 'x'.repeat(5000) } }).message.data).toEqual({ text: 'x'.repeat(5000) })
  })

  it('names the field and never its value', () => {
    expect(() => checkedSend(users, { title: 'Hi', url: 'javascript:secret-value' })).toThrow('The notification cannot be sent: its message.url is invalid')
  })
})
