import { describe, expect, it } from 'vitest'
import { ModelError, streamChatCompletion } from './chat-completions'

const sse = (events: unknown[]) =>
  new Response(events.map((event) => `data: ${typeof event === 'string' ? event : JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })

const delta = (content: string) => ({ choices: [{ delta: { content } }] })

// A fake OpenAI-compatible endpoint: records each request and answers with `answer`.
const fakeEndpoint = (answer: (request: Request) => Response | Promise<Response>) => {
  const requests: Request[] = []
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    requests.push(request)
    return answer(request)
  }) as typeof globalThis.fetch
  return { requests, fetch }
}

const settings = { baseUrl: 'https://openrouter.ai/api/v1', apiKey: 'sk-or-test', model: 'openrouter/auto' }
const messages = [{ role: 'system' as const, content: 'You answer questions.' }, { role: 'user' as const, content: 'How many orders?' }]

describe('streamChatCompletion', () => {
  it('posts the messages to <baseUrl>/chat/completions with the key, model and stream: true', async () => {
    const endpoint = fakeEndpoint(() => sse([delta('42'), '[DONE]']))
    await streamChatCompletion({ ...settings, fetch: endpoint.fetch }, messages, () => {})
    const [request] = endpoint.requests
    expect(request?.method).toBe('POST')
    expect(request?.url).toBe('https://openrouter.ai/api/v1/chat/completions')
    expect(request?.headers.get('authorization')).toBe('Bearer sk-or-test')
    expect(await request?.json()).toEqual({ model: 'openrouter/auto', messages, stream: true })
  })

  it('streams the answer piece by piece and resolves with all of it', async () => {
    const endpoint = fakeEndpoint(() => sse([{ choices: [{ delta: { role: 'assistant' } }] }, delta('There are '), delta('42 orders.'), '[DONE]']))
    const pieces: string[] = []
    await expect(streamChatCompletion({ ...settings, baseUrl: 'http://localhost:11434/v1', fetch: endpoint.fetch }, messages, (text) => pieces.push(text))).resolves.toEqual({ content: 'There are 42 orders.', toolCalls: [], reasoningDetails: [] })
    expect(pieces).toEqual(['There are ', '42 orders.'])
    expect(endpoint.requests[0]?.url).toBe('http://localhost:11434/v1/chat/completions')
  })

  it('offers tools and puts the streamed tool calls together', async () => {
    const tool = { type: 'function' as const, function: { name: 'run_query', description: 'Runs a query', parameters: { type: 'object', properties: { sql: { type: 'string' } } } } }
    const endpoint = fakeEndpoint(() =>
      sse([
        { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'run_query', arguments: '' } }] } }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"sql":"select ' } }] } }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '1"}' } }] } }] },
        '[DONE]',
      ]),
    )
    const completion = await streamChatCompletion({ ...settings, fetch: endpoint.fetch }, messages, () => {}, { tools: [tool] })
    expect(completion).toEqual({ content: '', toolCalls: [{ id: 'call_1', type: 'function', function: { name: 'run_query', arguments: '{"sql":"select 1"}' } }], reasoningDetails: [] })
    expect((await endpoint.requests[0]?.json()).tools).toEqual([tool])
  })

  it('asks for a reasoning effort and puts the streamed reasoning details together', async () => {
    const reasoning = (details: unknown[]) => ({ choices: [{ delta: { reasoning_details: details } }] })
    const endpoint = fakeEndpoint(() =>
      sse([
        reasoning([{ type: 'reasoning.text', text: 'Count ', index: 0, format: 'anthropic-claude-v1' }]),
        reasoning([{ type: 'reasoning.text', text: 'the orders.', index: 0 }]),
        reasoning([{ type: 'reasoning.text', signature: 'sig', index: 0 }, { type: 'reasoning.encrypted', data: 'abc', index: 1 }]),
        delta('42'),
        '[DONE]',
      ]),
    )
    const completion = await streamChatCompletion({ ...settings, fetch: endpoint.fetch }, messages, () => {}, { reasoning: 'low' })
    expect((await endpoint.requests[0]?.json()).reasoning).toEqual({ effort: 'low' })
    expect(completion.reasoningDetails).toEqual([
      { type: 'reasoning.text', text: 'Count the orders.', signature: 'sig', index: 0, format: 'anthropic-claude-v1' },
      { type: 'reasoning.encrypted', data: 'abc', index: 1 },
    ])
  })

  it('turns a refused key into a readable message', async () => {
    const endpoint = fakeEndpoint(() => Response.json({ error: { message: 'No auth credentials found', code: 401 } }, { status: 401 }))
    const call = streamChatCompletion({ ...settings, fetch: endpoint.fetch }, messages, () => {})
    await expect(call).rejects.toThrow(ModelError)
    await expect(call).rejects.toThrow('The model endpoint https://openrouter.ai/api/v1 answered 401: No auth credentials found (check the API key)')
  })

  it('reports an error in the stream and an unreachable endpoint', async () => {
    const streamed = fakeEndpoint(() => sse([delta('Half'), { error: { message: 'Provider overloaded' } }]))
    await expect(streamChatCompletion({ ...settings, fetch: streamed.fetch }, messages, () => {})).rejects.toThrow('The model endpoint https://openrouter.ai/api/v1 stopped: Provider overloaded')
    const down = fakeEndpoint(() => Promise.reject(new TypeError('fetch failed')))
    await expect(streamChatCompletion({ ...settings, fetch: down.fetch }, messages, () => {})).rejects.toThrow('Could not reach the model endpoint https://openrouter.ai/api/v1')
  })

  it('keeps a plain-text error short', async () => {
    const endpoint = fakeEndpoint(() => new Response('Bad Gateway', { status: 502 }))
    await expect(streamChatCompletion({ ...settings, fetch: endpoint.fetch }, messages, () => {})).rejects.toThrow('answered 502: Bad Gateway')
  })
})
