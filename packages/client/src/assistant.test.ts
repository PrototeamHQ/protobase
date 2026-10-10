import { describe, expect, it } from 'vitest'
import { createAssistantClient, type AssistantConnection } from './assistant'
import { ApiError } from './problem'
import type { AssistantEvent } from '@protobase/schema'

// A fake assistant backend: records requests and answers each with the next response of `answers`.
const fakeBackend = (answers: Array<() => Response>) => {
  const requests: Request[] = []
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(new URL(String(input), 'http://app.test'), init)
    requests.push(request)
    const answer = answers.shift()
    if (!answer) return new Promise<Response>(() => {})
    return answer()
  }) as typeof globalThis.fetch
  return { requests, fetch }
}

const events = (...list: AssistantEvent[]) => () => new Response(list.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })

const empty: AssistantEvent = { type: 'state', state: { messages: [], replying: false } }

describe('createAssistantClient', () => {
  it('posts messages and button clicks as JSON with the bearer token', async () => {
    const backend = fakeBackend([() => new Response(null, { status: 202 }), () => new Response(null, { status: 202 })])
    const client = createAssistantClient({ url: 'https://assistant.example.com/apps/7/', token: async () => 'jwt-1', fetch: backend.fetch })
    await client.send('How many orders?')
    await client.act('card-1', 'approve')
    expect(backend.requests.map((request) => [request.method, request.url, request.headers.get('authorization')])).toEqual([
      ['POST', 'https://assistant.example.com/apps/7/messages', 'Bearer jwt-1'],
      ['POST', 'https://assistant.example.com/apps/7/actions', 'Bearer jwt-1'],
    ])
    expect(await backend.requests[0]?.json()).toEqual({ text: 'How many orders?' })
    expect(await backend.requests[1]?.json()).toEqual({ partId: 'card-1', actionId: 'approve' })
  })

  it('rejects with the backend’s problem', async () => {
    const problem = { type: 'urn:protobase:problem:assistant-replying', title: 'Conflict', status: 409, detail: 'The assistant is still answering the last question' }
    const backend = fakeBackend([() => Response.json(problem, { status: 409, headers: { 'content-type': 'application/problem+json' } })])
    const sent = createAssistantClient({ url: '/api/assistant', token: () => 'jwt', fetch: backend.fetch }).send('Again')
    await expect(sent).rejects.toBeInstanceOf(ApiError)
    await expect(sent).rejects.toThrow('The assistant is still answering the last question')
  })

  it('follows the event stream, and reconnects with a fresh token when it ends or fails', async () => {
    const reply = { type: 'patch', replying: true } as const
    const backend = fakeBackend([events(empty, reply), () => new Response('down', { status: 503 }), events(empty)])
    let token = 0
    const received: AssistantEvent[] = []
    const connections: AssistantConnection['state'][] = []
    const client = createAssistantClient({ url: '/api/assistant', token: () => `jwt-${++token}`, fetch: backend.fetch, retryDelayMs: () => 0 })
    const stop = client.connect((event) => received.push(event), (connection) => connections.push(connection.state))
    await expect.poll(() => backend.requests.length).toBe(4)
    stop()
    expect(received).toEqual([empty, reply, empty])
    expect(connections).toEqual(['connecting', 'open', 'retrying', 'connecting', 'retrying', 'connecting', 'open', 'retrying', 'connecting'])
    expect(backend.requests.map((request) => [request.method, request.url, request.headers.get('authorization'), request.headers.get('accept')])).toEqual([
      ['GET', 'http://app.test/api/assistant/events', 'Bearer jwt-1', 'text/event-stream'],
      ['GET', 'http://app.test/api/assistant/events', 'Bearer jwt-2', 'text/event-stream'],
      ['GET', 'http://app.test/api/assistant/events', 'Bearer jwt-3', 'text/event-stream'],
      ['GET', 'http://app.test/api/assistant/events', 'Bearer jwt-4', 'text/event-stream'],
    ])
  })

  it('reports why a connection failed, and stops for good', async () => {
    const backend = fakeBackend([() => Response.json({ type: 'urn:protobase:problem:forbidden', title: 'Forbidden', status: 403 }, { status: 403 })])
    const connections: AssistantConnection[] = []
    const stop = createAssistantClient({ url: '/api/assistant', token: () => undefined, fetch: backend.fetch, retryDelayMs: () => 60_000 }).connect(() => {}, (connection) => connections.push(connection))
    await expect.poll(() => connections.length).toBe(2)
    stop()
    expect(connections[1]).toEqual({ state: 'retrying', error: expect.any(ApiError) })
    expect(backend.requests[0]?.headers.has('authorization')).toBe(false)
  })
})
