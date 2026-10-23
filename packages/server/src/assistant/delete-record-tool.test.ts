import { describe, expect, it, vi } from 'vitest'
import { ApprovalNeeded } from '../mcp/mcp-approval'
import { forbidden, notFound, preconditionFailed } from '../problem'
import type { ApprovalAnswer, ApprovalRequest } from './approval'
import { deleteRecordTool } from './delete-record-tool'
import type { ToolRecord, ToolRecords } from './records'
import type { ToolContext } from './tools'

const removed = { record: { id: 7, title: 'Secret plan' }, etag: '"v1"' }
const call = { resource: 'tasks', key: 7, etag: '"v1"' }

type Overrides = { delete?: () => Promise<ToolRecord>; softDeleteField?: () => Promise<string | undefined> }

const contextWith = (approve: (request: ApprovalRequest) => Promise<ApprovalAnswer>, overrides: Overrides = {}) => {
  const records = {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(overrides.delete ?? (async () => removed)),
    softDeleteField: vi.fn(overrides.softDeleteField ?? (async () => undefined)),
  }
  const asked = vi.fn(approve)
  const context = {
    session: { user: { id: 1, roles: ['sales'] } },
    show: () => {},
    approve: asked,
    records: records as unknown as ToolRecords,
    resources: async () => ({ models: [], views: [] }),
  } satisfies ToolContext
  return { context, approve: asked, records }
}

const answering = (answer: ApprovalAnswer) => async () => answer

const touchedNothing = (records: ReturnType<typeof contextWith>['records']) => {
  for (const method of [records.list, records.get, records.create, records.update, records.delete]) expect(method).not.toHaveBeenCalled()
}

describe('delete_record', () => {
  it('asks with the permanent wording first, then deletes once with the key and etag it asked about', async () => {
    const { context, approve, records } = contextWith(answering('approved'))
    const result = await deleteRecordTool().run(call, context)
    expect(approve).toHaveBeenCalledWith({
      title: 'Delete this tasks record for good? This cannot be undone: the record is removed.',
      fields: [{ label: 'Key', value: '7' }],
      tone: 'danger',
      approveLabel: 'Delete for good',
    })
    expect(records.delete).toHaveBeenCalledTimes(1)
    expect(records.delete).toHaveBeenCalledWith('tasks', 7, { etag: '"v1"' })
    expect(JSON.parse(result)).toEqual({ deleted: true, resource: 'tasks', key: 7, restorable: false })
    expect(result).not.toContain('Secret plan')
  })

  it('says a soft delete can be restored', async () => {
    const { context, approve } = contextWith(answering('approved'), { softDeleteField: async () => 'deleted_at' })
    const result = await deleteRecordTool().run({ ...call, key: [3, 'a'] }, context)
    expect(approve).toHaveBeenCalledWith({
      title: 'Delete this tasks record? It can be restored: the record is kept, marked deleted.',
      fields: [{ label: 'Key', value: '3,a' }],
      tone: 'warning',
      approveLabel: 'Delete',
    })
    expect(JSON.parse(result)).toEqual({ deleted: true, resource: 'tasks', key: [3, 'a'], restorable: true })
  })

  it('reads nothing but the config before the answer, and asks the same on the run with it', async () => {
    const asked: ApprovalRequest[] = []
    const first = contextWith(async (request) => {
      asked.push(request)
      throw new ApprovalNeeded(request)
    })
    await expect(deleteRecordTool().run(call, first.context)).rejects.toBeInstanceOf(ApprovalNeeded)
    touchedNothing(first.records)
    const again = contextWith(async (request) => {
      asked.push(request)
      return 'approved'
    })
    await deleteRecordTool().run(call, again.context)
    expect(asked[1]).toEqual(asked[0])
    expect(again.records.delete).toHaveBeenCalledTimes(1)
  })

  it.each(['rejected', 'expired'] as const)('deletes nothing when %s', async (answer) => {
    const { context, records } = contextWith(answering(answer))
    expect(await deleteRecordTool().run(call, context)).toBe(`The user did not approve this delete (${answer}); nothing was deleted.`)
    touchedNothing(records)
  })

  it.each([
    ['the access rules', forbidden('access-denied', 'You may not delete this tasks record')],
    ['a missing record', notFound('No tasks with this key')],
    ['a stale etag', preconditionFailed('The record changed since it was read; fetch it again')],
  ])('gives a refusal of %s back as its error and message', async (_, problem) => {
    const { context } = contextWith(answering('approved'), { delete: () => Promise.reject(problem) })
    expect(JSON.parse(await deleteRecordTool().run(call, context))).toEqual({ error: problem.slug, message: problem.detail })
  })

  it('lets an unexpected failure fail the call rather than read as a delete', async () => {
    const failure = new Error('connect postgres://user:secret@db/app failed')
    const { context } = contextWith(answering('approved'), { delete: () => Promise.reject(failure) })
    await expect(deleteRecordTool().run(call, context)).rejects.toBe(failure)
  })

  it('refuses a resource the app does not have before asking', async () => {
    const { context, approve } = contextWith(answering('approved'), { softDeleteField: () => Promise.reject(notFound('There is no resource "nothing"')) })
    expect(JSON.parse(await deleteRecordTool().run({ ...call, resource: 'nothing' }, context))).toEqual({ error: 'not-found', message: 'There is no resource "nothing"' })
    expect(approve).not.toHaveBeenCalled()
  })

  const badCall = (name: string, args: Record<string, unknown>): [string, Record<string, unknown>] => [name, args]
  it.each([
    badCall('no etag', { resource: 'tasks', key: 7 }),
    ...['*', '', ' ', 'v1', 'W/"v1"', '"v1", *', '"v1","v2"', '"a,*"', null, 1, ['"v1"'], { etag: '"v1"' }].map((etag) => badCall(`the etag ${JSON.stringify(etag)}`, { ...call, etag })),
    ...[{ $ne: null }, [], '', [''], null, Number.NaN, 'a\nb', 'a\u0007', '\u202Eabc', 'a\u2066b', 'a\u2028b'].map((key) => badCall(`the key ${JSON.stringify(key)}`, { ...call, key })),
    ...['approved', 'confirm', 'force', 'permanent', 'soft', 'as', 'user'].map((name) => badCall(`the extra argument ${name}`, { ...call, [name]: true })),
    badCall('no resource', { key: 7, etag: '"v1"' }),
  ])('refuses %s before asking', async (_, args) => {
    const { context, approve, records } = contextWith(answering('approved'))
    expect(await deleteRecordTool().run(args, context)).toMatch(/^Pass only the resource, key and etag/)
    expect(approve).not.toHaveBeenCalled()
    touchedNothing(records)
  })

  it('passes a key such as * or 1 OR 1=1 on as one literal key', async () => {
    const { context, records } = contextWith(answering('approved'))
    for (const key of ['*', '%', '1 OR 1=1']) await deleteRecordTool().run({ ...call, key }, context)
    expect(records.delete.mock.calls).toEqual([['tasks', '*', { etag: '"v1"' }], ['tasks', '%', { etag: '"v1"' }], ['tasks', '1 OR 1=1', { etag: '"v1"' }]])
  })

  describe('limited to some resources', () => {
    const only = { resources: ['tasks'] }

    it('names them and deletes a record of a listed one', async () => {
      const { context, records } = contextWith(answering('approved'))
      expect(deleteRecordTool(only).description).toMatch(/It writes only tasks\.$/)
      await deleteRecordTool(only).run(call, context)
      expect(records.delete).toHaveBeenCalledWith('tasks', 7, { etag: '"v1"' })
    })

    it.each(['companies', 'Tasks', ' tasks', 'tasks\n', 't\u0430sks', '__proto__', 'constructor', 'toString'])('refuses %j before asking or reading', async (resource) => {
      const { context, approve, records } = contextWith(answering('approved'))
      expect(JSON.parse(await deleteRecordTool(only).run({ ...call, resource }, context))).toEqual({ error: 'forbidden', message: `Writes over MCP reach only tasks, not ${resource}; nothing was written.` })
      expect(approve).not.toHaveBeenCalled()
      expect(records.softDeleteField).not.toHaveBeenCalled()
      touchedNothing(records)
    })
  })
})
