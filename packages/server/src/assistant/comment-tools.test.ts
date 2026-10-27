import { describe, expect, it, vi } from 'vitest'
import type { ToolComments } from '../comments/tool-comment-types'
import { notFound } from '../problem'
import type { ApprovalAnswer } from './approval'
import { addCommentTool, commentTools, listCommentsTool } from './comment-tools'
import type { ToolRecords } from './records'
import type { ReadableResources, ToolContext } from './tools'

const readable = {
  models: [{ name: 'tasks', primaryKey: ['id'], fields: { id: { name: 'id', type: 'bigint' }, title: { name: 'title', type: 'text' } } }],
  views: [{ resource: 'tasks', names: { singular: 'Task', plural: 'Tasks' }, fields: {} }],
} as unknown as ReadableResources
const task = { record: { id: 42, title: 'Fix the sign-in lockout' }, etag: '"v1"' }
const comment = { author: { id: '1', name: 'Ana' }, created_at: '2026-08-01T00:00:00.000Z', text: 'Keep it small.' }
const commented = { commented: ['tasks'] }

const contextWith = (answer: ApprovalAnswer, comments: Partial<ToolComments>, records: Partial<ToolRecords> = {}) => {
  const approve = vi.fn(async () => answer)
  const context = {
    session: { user: { id: 1, roles: ['sales'] } },
    show: () => {},
    approve,
    records: { get: async () => task, ...records } as ToolRecords,
    resources: async () => readable,
    comments: comments as ToolComments,
  } satisfies ToolContext
  return { context, approve }
}

describe('comment tools', () => {
  it('offers list_comments where a resource takes comments, and add_comment only with writes on', () => {
    const names = (writes: Parameters<typeof commentTools>[1], names: string[] = ['tasks']) => commentTools({ commented: names }, writes).map((tool) => tool.name)
    expect(names({}, [])).toEqual([])
    expect(names(false)).toEqual(['list_comments'])
    expect(names({})).toEqual(['list_comments', 'add_comment'])
    expect(names({ resources: ['tasks', 'labels'] })).toEqual(['list_comments', 'add_comment'])
    expect(names({ resources: ['labels'] })).toEqual(['list_comments'])
  })

  it('names the resources with comments, and those writes list, in the resource parameter', () => {
    const resourceOf = (tool: { parameters: Record<string, unknown> }) => (tool.parameters as { properties: { resource: { description: string } } }).properties.resource.description
    const [list, add] = commentTools({ commented: ['tasks', 'notes'] }, { resources: ['notes', 'labels'] })
    expect(resourceOf(list!)).toBe('The resource\'s name: one of tasks, notes, whose records take comments.')
    expect(resourceOf(add!)).toBe('The resource\'s name: one of notes, whose records take comments.')
    expect(add!.description).toMatch(/It writes only notes\.$/)
  })

  it('list_comments reads a page through the comments service', async () => {
    const list = vi.fn(async () => ({ items: [comment], next_page_token: '' }))
    const { context } = contextWith('approved', { list })
    expect(JSON.parse(await listCommentsTool(commented).run({ resource: 'tasks', key: 42, page_size: 500, page_token: '9' }, context))).toEqual({ items: [comment], next_page_token: '' })
    expect(list).toHaveBeenCalledWith('tasks', 42, { page_size: 100, page_token: '9' })
  })

  it('list_comments refuses a resource without comments, and gives back the service\'s refusal', async () => {
    const list = vi.fn(() => Promise.reject(notFound('No tasks with this key')))
    const { context } = contextWith('approved', { list })
    expect(JSON.parse(await listCommentsTool(commented).run({ resource: 'labels', key: 1 }, context))).toEqual({ error: 'not-found', message: 'labels takes no comments' })
    expect(JSON.parse(await listCommentsTool(commented).run({ resource: 'tasks', key: 1 }, context))).toEqual({ error: 'not-found', message: 'No tasks with this key' })
  })

  it('add_comment asks naming the record with the whole comment, then adds it', async () => {
    const add = vi.fn(async () => comment)
    const { context, approve } = contextWith('approved', { add })
    const result = await addCommentTool(commented).run({ resource: 'tasks', key: 42, text: ' Keep it small.\nNo new deps.‮ ' }, context)
    expect(approve).toHaveBeenCalledWith({ title: 'Comment on Task #42 "Fix the sign-in lockout"?', body: 'Keep it small.\nNo new deps. ', approveLabel: 'Comment', rejectLabel: 'Cancel' })
    expect(add).toHaveBeenCalledWith('tasks', 42, ' Keep it small.\nNo new deps.‮ ')
    expect(JSON.parse(result)).toEqual(comment)
  })

  it.each(['rejected', 'expired'] as const)('add_comment writes nothing when %s', async (answer) => {
    const add = vi.fn(async () => comment)
    const { context } = contextWith(answer, { add })
    expect(await addCommentTool(commented).run({ resource: 'tasks', key: 42, text: 'Hi' }, context)).toBe(`The user did not approve this change (${answer}); nothing was written.`)
    expect(add).not.toHaveBeenCalled()
  })

  it('add_comment refuses before asking: outside the listed resources, without comments, empty, or a record the caller cannot read', async () => {
    const add = vi.fn(async () => comment)
    const { context, approve } = contextWith('approved', { add }, { get: () => Promise.reject(notFound('No tasks with this key')) })
    const limited = addCommentTool({ commented: ['tasks', 'notes'], resources: ['tasks'] })
    expect(JSON.parse(await limited.run({ resource: 'notes', key: 1, text: 'Hi' }, context))).toEqual({ error: 'forbidden', message: 'Writes over MCP reach only tasks, not notes; nothing was written.' })
    expect(JSON.parse(await limited.run({ resource: 'labels', key: 1, text: 'Hi' }, context))).toMatchObject({ error: 'forbidden' })
    expect(JSON.parse(await addCommentTool(commented).run({ resource: 'labels', key: 1, text: 'Hi' }, context))).toEqual({ error: 'not-found', message: 'labels takes no comments' })
    expect(JSON.parse(await addCommentTool(commented).run({ resource: 'tasks', key: 1, text: '  ' }, context))).toEqual({ error: 'invalid-comment', message: 'The comment is empty' })
    expect(JSON.parse(await addCommentTool(commented).run({ resource: 'tasks', key: 1, text: 'Hi' }, context))).toEqual({ error: 'not-found', message: 'No tasks with this key' })
    expect(approve).not.toHaveBeenCalled()
    expect(add).not.toHaveBeenCalled()
  })
})
