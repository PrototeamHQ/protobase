import { describe, expect, it } from 'vitest'
import { Composer, Page, RecordCard, Thread } from './blocks'
import { pageProblems } from './check-page'
import { structureProblems } from './check-structure'
import type { LayoutNode } from './node'
import { models } from './testing/models'

const input = { models, actions: () => new Set<string>() }
const thread = '<Page> › <Thread resource="messages">'
const composer = '<Page> › <Composer resource="messages">'
const problems = (...children: LayoutNode[]) => pageProblems({ name: 'chat', title: 'Chat', tree: Page({ title: 'Chat', children }) }, input)

describe('a conversation', () => {
  it('accepts a thread and a composer over the same messages', () => {
    const tree = Page({
      title: 'Chat',
      children: [Thread({ resource: 'messages', filter: "room = 'general'", sender: 'author', time: 'sentAt', text: 'body', limit: 30 }), Composer({ resource: 'messages', field: 'body', values: { room: 'general' } })],
    })
    expect(structureProblems(tree)).toEqual([])
    expect(problems(...tree.children.filter((child) => typeof child !== 'string'))).toEqual([])
  })

  it('needs the fields that give the sender, time and text', () => {
    expect(structureProblems(Page({ title: 'Chat', children: [Thread({ resource: 'messages' } as never)] }))).toEqual([`${thread}: "sender" is required`, `${thread}: "time" is required`, `${thread}: "text" is required`])
  })

  it('reads at most one page of the API at once', () => {
    expect(problems(Thread({ resource: 'messages', sender: 'author', time: 'sentAt', text: 'body', limit: 500 }))).toEqual([])
    expect(problems(Thread({ resource: 'messages', sender: 'author', time: 'sentAt', text: 'body', limit: 501 }))).toEqual([`${thread}: limit must be a whole number from 1 to 500`])
  })

  it('names the fields a thread reads that the messages do not have', () => {
    expect(problems(Thread({ resource: 'messages', sender: 'writer', time: 'sentAt', text: 'content' }))).toEqual([
      `${thread}: sender: unknown field "writer" on messages`,
      `${thread}: text: unknown field "content" on messages`,
    ])
  })

  it('orders the messages by a time the API can sort by', () => {
    expect(problems(Thread({ resource: 'messages', sender: 'author', time: 'body', text: 'body' }))).toEqual([`${thread}: time: "body" is text; a thread orders its messages by a date or timestamp field`])
    expect(problems(Thread({ resource: 'messages', sender: 'author', time: 'sentOn', text: 'body' }))).toEqual([expect.stringMatching(/Thread.*: time: .*sentOn/)])
  })

  it('shows a text or enum field as each message’s status', () => {
    expect(problems(Thread({ resource: 'messages', sender: 'author', time: 'sentAt', text: 'body', status: 'room' }))).toEqual([])
    expect(problems(Thread({ resource: 'messages', sender: 'author', time: 'sentAt', text: 'body', status: 'pinned' }))).toEqual([`${thread}: status: "pinned" is boolean; a message's status is a text or enum field`])
    expect(problems(Thread({ resource: 'messages', sender: 'author', time: 'sentAt', text: 'body', status: 'state' }))).toEqual([`${thread}: status: unknown field "state" on messages`])
  })

  it('shows its working indicator by a condition on the record around it', () => {
    const working = (condition: string) => problems(RecordCard({ resource: 'subscriptions', children: Thread({ resource: 'messages', sender: 'author', time: 'sentAt', text: 'body', working: condition }) }))
    expect(working("status = 'active'")).toEqual([])
    expect(working("state = 'busy'")).toEqual([expect.stringMatching(/Thread.*: working: .*state/)])
    expect(problems(Thread({ resource: 'messages', sender: 'author', time: 'sentAt', text: 'body', working: "status = 'active'" }))).toEqual([expect.stringMatching(/Thread.*: working: .*outside a record/)])
  })

  it('writes a message into a text field the sender may set', () => {
    expect(problems(Composer({ resource: 'messages', field: 'pinned' }))).toEqual([`${composer}: field: "pinned" is boolean; a message is written into a text field`])
    expect(problems(Composer({ resource: 'messages', field: 'nope', values: { channel: 'x' } }))).toEqual([`${composer}: field: unknown field "nope" on messages`, `${composer}: values: unknown field "channel" on messages`])
    expect(problems(Composer({ resource: 'chats', field: 'body' }))).toEqual(['<Page> › <Composer resource="chats">: unknown resource "chats"'])
  })
  it('sends with each message only values of fields the sender may set', () => {
    expect(problems(Composer({ resource: 'messages', field: 'body', values: { room: 'general', pinned: true } }))).toEqual([])
    expect(problems(Composer({ resource: 'messages', field: 'body', values: { sentAt: '2026-01-01T00:00:00Z', organizationId: 2, author: 3, channel: 'x' } }))).toEqual([
      `${composer}: values: "sentAt" is read-only on messages, so a message cannot set it`,
      `${composer}: values: "organizationId" is read-only on messages, so a message cannot set it`,
      `${composer}: values: "author" is read-only on messages, so a message cannot set it`,
      `${composer}: values: unknown field "channel" on messages`,
    ])
  })
})
