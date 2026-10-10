import { appendFile, mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ConversationRecord } from './conversation-store'
import { fileConversationStore } from './file-conversation-store'

let directory: string
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'protobase-chats-'))
})
afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

const owner = JSON.stringify(['acme', 'user-1'])
const question: ConversationRecord = { type: 'transcript', message: { role: 'user', content: 'How many orders?' } }
const answer: ConversationRecord = { type: 'message', message: { id: 'm1', from: 'assistant', parts: [{ type: 'text', id: 'p1', text: '42' }] } }

describe('fileConversationStore', () => {
  it('appends records as lines of a file per conversation and loads them in order', async () => {
    const store = fileConversationStore(`${directory}/chats`)
    expect(await store.load(owner, 'chat')).toEqual([])
    await store.append(owner, 'chat', [question])
    await store.append(owner, 'chat', [answer])
    expect(await store.load(owner, 'chat')).toEqual([question, answer])
    const [folder] = await readdir(`${directory}/chats`)
    expect(await readFile(`${directory}/chats/${folder}/chat.jsonl`, 'utf8')).toBe(`${JSON.stringify(question)}\n${JSON.stringify(answer)}\n`)
  })

  it('lists an owner’s conversations, the latest changed first', async () => {
    const store = fileConversationStore(directory)
    expect(await store.list(owner)).toEqual([])
    await store.append(owner, 'older', [question])
    await new Promise((resolve) => setTimeout(resolve, 20))
    await store.append(owner, 'newer', [question])
    await store.append('someone else', 'theirs', [question])
    expect((await store.list(owner)).map((entry) => entry.id)).toEqual(['newer', 'older'])
  })

  it('keeps owners and ids inside the directory', async () => {
    const store = fileConversationStore(`${directory}/chats`)
    await store.append('..', '../../escape', [question])
    expect(await readdir(directory)).toEqual(['chats'])
    expect(await store.load('..', '../../escape')).toEqual([question])
    expect(await store.list('..')).toEqual([{ id: '../../escape', updatedAt: expect.any(Date) }])
  })

  it('leaves out a last line a crash cut off', async () => {
    const store = fileConversationStore(directory)
    await store.append(owner, 'chat', [question])
    const [folder] = await readdir(directory)
    await appendFile(`${directory}/${folder}/chat.jsonl`, '{"type":"tran')
    expect(await store.load(owner, 'chat')).toEqual([question])
  })
})
