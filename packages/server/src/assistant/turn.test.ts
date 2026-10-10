import { describe, expect, it } from 'vitest'
import type { ConversationRecord } from './conversation-store'
import { createConversations } from './conversations'
import { defineTool } from './tools'
import { runTurn, type TurnOptions } from './turn'

const sse = (chunks: unknown[]) => new Response([...chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`), 'data: [DONE]\n\n'].join(''), { headers: { 'content-type': 'text/event-stream' } })
const says = (content: string) => () => sse([{ choices: [{ delta: { content } }] }])
const calls = (name: string, args: unknown, reasoning?: unknown[]) => () =>
  sse([{ choices: [{ delta: { ...(reasoning && { reasoning_details: reasoning }), tool_calls: [{ index: 0, id: `call-${name}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }] }])

// A fake OpenAI-compatible endpoint: answers each request with the next of `answers`, recording the request bodies.
const fakeModel = (answers: Array<() => Response>) => {
  const bodies: any[] = []
  const fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)))
    const answer = answers.shift()
    if (!answer) throw new Error('The fake model got more requests than answers')
    return answer()
  }) as typeof globalThis.fetch
  return { bodies, fetch }
}

const countTool = defineTool({ name: 'count', description: 'Counts orders', parameters: { type: 'object' }, run: async () => '42' })

const setup = async (answers: Array<() => Response>, options: Partial<TurnOptions> = {}) => {
  const model = fakeModel(answers)
  const saved: ConversationRecord[] = []
  const conversations = createConversations({ store: { load: async () => [], append: async (_owner, _id, records) => void saved.push(...records), list: async () => [] } })
  const conversation = await conversations('ann')
  const turn = (text: string, more: Partial<TurnOptions> = {}) =>
    runTurn({ model: { baseUrl: 'https://openrouter.ai/api/v1', apiKey: 'key', model: 'test/model', fetch: model.fetch }, conversation, session: { user: { id: 1, roles: ['admin'] } }, system: 'You answer.', tools: [countTool], ...options, ...more }, text)
  return { model, conversation, saved, turn }
}

const reasoning = [{ type: 'reasoning.encrypted', data: 'abc', index: 0 }]

describe('runTurn', () => {
  it('sends the context with the message and keeps the transcript as the model read it, so the next turn starts the same', async () => {
    const { model, conversation, turn } = await setup([calls('count', {}, reasoning), says('42 orders.'), says('You are welcome.')])
    await turn('How many orders?', { context: 'The user is on /orders.' })
    await turn('Thanks')

    const [first, second, third] = model.bodies
    expect(first.messages).toEqual([{ role: 'system', content: 'You answer.' }, { role: 'user', content: 'The user is on /orders.\n\nHow many orders?' }])
    expect(second.messages.slice(2)).toEqual([
      { role: 'assistant', content: null, tool_calls: [{ id: 'call-count', type: 'function', function: { name: 'count', arguments: '{}' } }], reasoning_details: reasoning },
      { role: 'tool', tool_call_id: 'call-count', content: '42' },
    ])
    expect(third.messages.slice(0, 4)).toEqual(second.messages)
    expect(third.messages.slice(4)).toEqual([{ role: 'assistant', content: '42 orders.' }, { role: 'user', content: 'Thanks' }])
    expect(conversation.state().messages.map((message) => message.parts.find((part) => part.type === 'text'))).toMatchObject([{ text: 'How many orders?' }, { text: '42 orders.' }, { text: 'Thanks' }, { text: 'You are welcome.' }])
    expect(first).not.toHaveProperty('reasoning')
  })

  it('marks cache breakpoints on the system prompt, the earlier transcript and the latest message', async () => {
    const { model, turn } = await setup([says('Hi.'), calls('count', {}), says('42.')], { cache: true, reasoning: 'low' })
    await turn('Hello')
    await turn('How many?')

    const cached = (text: string) => [{ type: 'text', text, cache_control: { type: 'ephemeral' } }]
    expect(model.bodies[0].messages).toEqual([{ role: 'system', content: cached('You answer.') }, { role: 'user', content: cached('Hello') }])
    expect(model.bodies[2].messages).toEqual([
      { role: 'system', content: cached('You answer.') },
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: cached('Hi.') },
      { role: 'user', content: 'How many?' },
      { role: 'assistant', content: null, tool_calls: [expect.objectContaining({ id: 'call-count' })] },
      { role: 'tool', tool_call_id: 'call-count', content: cached('42') },
    ])
    expect(model.bodies.map((body) => body.reasoning)).toEqual([{ effort: 'low' }, { effort: 'low' }, { effort: 'low' }])
  })

  it('keeps only the user’s message of a failed turn, shows why and saves the chat', async () => {
    const { model, conversation, saved, turn } = await setup([calls('count', {}), () => Response.json({ error: { message: 'Overloaded' } }, { status: 503 }), says('Fine now.')])
    await turn('How many orders?')
    expect(conversation.transcript()).toEqual([{ role: 'user', content: 'How many orders?' }])
    expect(conversation.state().replying).toBe(false)
    expect(conversation.state().messages.at(-1)?.parts.at(-1)).toMatchObject({ type: 'card', tone: 'danger', body: 'The model endpoint https://openrouter.ai/api/v1 answered 503: Overloaded' })
    expect(saved.filter((record) => record.type === 'transcript')).toEqual([{ type: 'transcript', message: { role: 'user', content: 'How many orders?' } }])

    await turn('Again?')
    expect(model.bodies[2].messages.slice(1)).toEqual([{ role: 'user', content: 'How many orders?' }, { role: 'user', content: 'Again?' }])
  })
})
