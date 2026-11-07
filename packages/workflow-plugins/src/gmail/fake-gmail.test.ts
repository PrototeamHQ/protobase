import { describe, expect, it } from 'vitest'
import { fakeGmail } from '../../../../test-support/fake-gmail/fake-gmail'
import { mail } from '../../../../test-support/fake-gmail/mail'
import { recordedCalls, recording, type RecordedCall } from '../../../../test-support/fake-gmail/recordings'

// The shape of a JSON value: each key with the shape of its value, an array by its first item, a value by its type.
const shape = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.length === 0 ? [] : [shape(value[0])]
  if (typeof value === 'object' && value !== null) return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, shape(item)]))
  return typeof value
}

describe('the Gmail fake', () => {
  it('answers each recorded call with its recording’s status, content type and shape', async () => {
    const gmail = fakeGmail()
    const start = gmail.historyId
    const [id] = gmail.deliver([mail()])
    const recordedId = (recording('messages').response.body as { messages: [{ id: string }] }).messages[0].id
    for (const name of recordedCalls) {
      const { request, response } = recording(name)
      const query = new URLSearchParams(request.query.map(([key, value]): [string, string] => [key, key === 'startHistoryId' ? start : key === 'q' ? 'after:0' : value]))
      const path = request.path.replace(recordedId, id!)
      const token = name === 'unauthenticated' ? 'refused-token' : 'token-1'
      const answer = await gmail.handle(new Request(`${gmail.origin}/gmail/v1/users/me/${path}?${query}`, { headers: { authorization: `Bearer ${token}` } }))
      expect({ name, status: answer.status, type: answer.headers.get('content-type')?.split(';')[0], shape: shape(await answer.json()) }).toEqual({ name, status: response.status, type: response.headers['content-type']!.split(';')[0], shape: shape(response.body) })
    }
  })

  it('answers a message it has not and a refused token exactly as Gmail did', async () => {
    const gmail = fakeGmail()
    const answers: Record<string, RecordedCall> = { 'messages/0000000000000001': 'message-not-found', profile: 'unauthenticated' }
    for (const [path, name] of Object.entries(answers)) {
      const answer = await gmail.handle(new Request(`${gmail.origin}/gmail/v1/users/me/${path}`, { headers: { authorization: `Bearer ${name === 'unauthenticated' ? 'refused-token' : 'token-1'}` } }))
      expect(await answer.json()).toEqual(recording(name).response.body)
    }
  })
})
