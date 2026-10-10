import { describe, expect, it } from 'vitest'
import type { AssistantMessage } from '@protobase/schema'
import type { ChatMessage } from './chat-completions'
import type { ConversationRecord, ConversationStore } from './conversation-store'
import { createConversations } from './conversations'

// A store in memory that records every append.
const memoryStore = () => {
  const files = new Map<string, ConversationRecord[]>()
  const appends: ConversationRecord[][] = []
  const store: ConversationStore = {
    load: async (owner, id) => files.get(`${owner}/${id}`) ?? [],
    append: async (owner, id, records) => {
      appends.push(records)
      files.set(`${owner}/${id}`, [...(files.get(`${owner}/${id}`) ?? []), ...records])
    },
    list: async () => [],
  }
  return { store, appends }
}

const said = (id: string, from: 'user' | 'assistant', text: string): AssistantMessage => ({ id, from, parts: [{ type: 'text', id: `${id}-text`, text }] })
const user = (content: string): ChatMessage => ({ role: 'user', content })
const assistant = (content: string): ChatMessage => ({ role: 'assistant', content })

describe('createConversations', () => {
  it('gives each owner one conversation, the same one to every request', async () => {
    const conversations = createConversations()
    const [first, again] = await Promise.all([conversations('ann'), conversations('ann')])
    expect(first).toBe(again)
    expect(await conversations('bob')).not.toBe(first)
  })

  it('saves the changed messages and the new transcript, and loads them back after a restart', async () => {
    const { store, appends } = memoryStore()
    const conversation = await createConversations({ store })('ann')
    conversation.apply({ type: 'message', message: said('m1', 'user', 'How many orders?') })
    conversation.apply({ type: 'patch', replying: true })
    conversation.apply({ type: 'part', messageId: 'm2', part: { type: 'text', id: 'p', text: '4' } })
    conversation.apply({ type: 'part', messageId: 'm2', part: { type: 'text', id: 'p', text: '42' } })
    conversation.remember(user('How many orders?'), assistant('42'))
    await conversation.save()
    await conversation.save()

    expect(appends).toEqual([
      [
        { type: 'message', message: said('m1', 'user', 'How many orders?') },
        { type: 'message', message: { id: 'm2', from: 'assistant', parts: [{ type: 'text', id: 'p', text: '42' }] } },
        { type: 'transcript', message: user('How many orders?') },
        { type: 'transcript', message: assistant('42') },
      ],
    ])
    const restarted = await createConversations({ store })('ann')
    expect(restarted.state()).toEqual({ messages: [said('m1', 'user', 'How many orders?'), { id: 'm2', from: 'assistant', parts: [{ type: 'text', id: 'p', text: '42' }] }], replying: false })
    expect(restarted.transcript()).toEqual([user('How many orders?'), assistant('42')])
  })

  it('saves a replaced state whole', async () => {
    const { store, appends } = memoryStore()
    const conversation = await createConversations({ store })('ann')
    conversation.apply({ type: 'message', message: said('m1', 'user', 'Hi') })
    conversation.apply({ type: 'state', state: { messages: [said('m2', 'assistant', 'Fresh start')], replying: true } })
    await conversation.save()
    expect(appends).toEqual([[{ type: 'state', state: { messages: [said('m2', 'assistant', 'Fresh start')], replying: false } }]])
    expect((await createConversations({ store })('ann')).state().messages).toEqual([said('m2', 'assistant', 'Fresh start')])
  })

  it('keeps the last messages of the chat', async () => {
    const conversation = await createConversations({ keepMessages: 2 })('ann')
    for (const id of ['m1', 'm2', 'm3']) conversation.apply({ type: 'message', message: said(id, 'user', id) })
    expect(conversation.state().messages.map((message) => message.id)).toEqual(['m2', 'm3'])
  })

  it('drops the older half of a long transcript at a user message, so its start stays the same for several turns', async () => {
    const conversation = await createConversations({ keepTranscript: 6 })('ann')
    const turn = (n: number) => conversation.remember(user(`q${n}`), { role: 'assistant', content: null, tool_calls: [{ id: `c${n}`, type: 'function', function: { name: 'run', arguments: '{}' } }] }, { role: 'tool', tool_call_id: `c${n}`, content: 'rows' }, assistant(`a${n}`))
    turn(1)
    turn(2)
    expect(conversation.transcript()).toHaveLength(8)
    turn(3)
    expect(conversation.transcript().map((message) => message.content)).toEqual(['q3', null, 'rows', 'a3'])
    conversation.remember(user('q4'))
    expect(conversation.transcript()[0]).toEqual(user('q3'))
  })

  it('tries a load that failed again on the next request', async () => {
    let fail = true
    const store: ConversationStore = { load: async () => (fail ? Promise.reject(new Error('disk gone')) : []), append: async () => {}, list: async () => [] }
    const conversations = createConversations({ store })
    await expect(conversations('ann')).rejects.toThrow('disk gone')
    fail = false
    await expect(conversations('ann')).resolves.toBeDefined()
  })
})
