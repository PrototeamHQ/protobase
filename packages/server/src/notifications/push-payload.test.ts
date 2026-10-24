import { describe, expect, it } from 'vitest'
import { pushPayload } from './push-payload'

const validate = (value: unknown) => pushPayload['~standard'].validate(value) as { value?: unknown; issues?: { message: string }[] }

describe('pushPayload', () => {
  it('takes a send as sendNotification enqueues it, with its progress, and a complete send', () => {
    const send = { to: { userIds: ['a'], inbox: true }, message: { title: 'Hi' } }
    expect(validate(send).value).toEqual(send)
    const progress = { recorded: ['a'], done: ['d'], retried: [] }
    expect(validate({ ...send, progress }).value).toEqual({ ...send, progress })
    expect(validate({ complete: true }).value).toEqual({ complete: true })
  })

  it.each([
    ['a javascript: url', { to: { userIds: ['a'], inbox: true }, message: { title: 'Hi', url: 'javascript:alert(1)' } }],
    ['an inbox flag that is not a boolean', { to: { userIds: ['a'], inbox: 'false' }, message: { title: 'Hi' } }],
    ['an unknown message field', { to: { userIds: ['a'], inbox: false }, message: { title: 'Hi', actions: [] } }],
    ['an unknown field', { to: { deviceIds: ['d'] }, message: { title: 'Hi' }, endpoint: 'https://fcm.googleapis.com/x' }],
    ['an invalid progress', { to: { deviceIds: ['d'] }, message: { title: 'Hi' }, progress: { done: 'd' } }],
    ['a complete send with more', { complete: true, to: { deviceIds: ['d'] } }],
    ['no object', 'send'],
  ])('refuses a job queued around the send call with %s', (_name, payload) => {
    expect(validate(payload).issues).toHaveLength(1)
  })
})
