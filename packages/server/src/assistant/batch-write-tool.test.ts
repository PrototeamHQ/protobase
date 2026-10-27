import type { ResourceModel } from '@protobase/schema'
import { describe, expect, it, vi } from 'vitest'
import { HttpProblem, forbidden, notFound, preconditionFailed } from '../problem'
import type { ApprovalAnswer, ApprovalRequest } from './approval'
import { batchWriteTool } from './batch-write-tool'
import type { ToolRecords } from './records'
import type { ToolContext } from './tools'

const results = [
  { op: 'create', resource: 'tasks', ref: 'task', record: { id: 7, title: 'Plan', done: false, notes: 'Long' }, etag: '"v1"' },
  { op: 'update', resource: 'tasks', record: { id: 3, title: 'Ship', done: true, notes: 'Long' }, etag: '"v1"' },
  { op: 'delete', resource: 'links', deleted: true },
]

const batch = [
  { op: 'create', resource: 'tasks', data: { title: 'Plan' }, ref: 'task' },
  { op: 'update', resource: 'tasks', key: 3, etag: '"v0"', data: { done: true } },
  { op: 'delete', resource: 'links', key: [3, 'a'] },
]

// Every records method, so a test can tell that none of them ran.
const recordsWith = (run: ToolRecords['batch']) => ({
  list: vi.fn(),
  get: vi.fn(async () => ({ record: { id: 3, title: 'Ship', done: false, notes: 'Long' }, etag: '"v0"' })),
  create: vi.fn(),
  update: vi.fn(),
  batch: vi.fn(run),
})

const contextWith = (answer: ApprovalAnswer | Error, run: ToolRecords['batch'] = async () => results as never, models: Array<Partial<ResourceModel>> = []) => {
  const approve = vi.fn(async (_request: ApprovalRequest) => {
    if (answer instanceof Error) throw answer
    return answer
  })
  const records = recordsWith(run)
  const context = {
    session: { user: { id: 1, roles: ['sales'] } },
    show: () => {},
    approve,
    records: { ...records, softDeleteField: async (resource: string) => models.find((model) => model.name === resource)?.softDelete } as unknown as ToolRecords,
    resources: async () => ({ models: models as ResourceModel[], views: [] }),
  } satisfies ToolContext
  return { context, approve, records }
}

const untouched = (records: ReturnType<typeof recordsWith>) => {
  for (const method of Object.values(records)) expect(method).not.toHaveBeenCalled()
}

describe('batch_write', () => {
  it('asks once for the whole batch, then runs it through the records batch and returns each result', async () => {
    const { context, approve, records } = contextWith('approved')
    const result = await batchWriteTool().run({ operations: batch }, context)
    expect(approve).toHaveBeenCalledTimes(1)
    expect(approve).toHaveBeenCalledWith(expect.objectContaining({ title: 'Run 3 writes in one transaction?', approveLabel: 'Write all' }))
    expect(records.batch).toHaveBeenCalledWith(batch)
    expect(JSON.parse(result)).toEqual({
      results: [
        { op: 'create', resource: 'tasks', ref: 'task', etag: '"v1"', record: { title: 'Plan' } },
        { op: 'update', resource: 'tasks', etag: '"v1"', record: { done: true } },
        { op: 'delete', resource: 'links', deleted: true },
      ],
    })
  })

  it('gives each record back by its key with the read-only fields the batch changed, and the fields an operation asks for', async () => {
    const tasks = { name: 'tasks', primaryKey: ['id'], fields: { id: { readOnly: true }, done: {}, notes: {}, title: {} } } as unknown as ResourceModel
    for (const [name, field] of Object.entries(tasks.fields)) Object.assign(field, { name, readOnly: field.readOnly ?? false })
    const { context, records } = contextWith('approved', undefined, [tasks])
    const operations = [{ ...batch[0], fields: ['done'] }, { ...batch[1], fields: ['*'] }, batch[2]]
    const result = await batchWriteTool().run({ operations }, context)
    expect(records.batch).toHaveBeenCalledWith(batch)
    expect(records.get).toHaveBeenCalledWith('tasks', 3)
    expect(JSON.parse(result)).toEqual({
      results: [
        { op: 'create', resource: 'tasks', ref: 'task', key: 7, etag: '"v1"', record: { id: 7, title: 'Plan', done: false } },
        { op: 'update', resource: 'tasks', key: 3, etag: '"v1"', record: results[1]!.record },
        { op: 'delete', resource: 'links', deleted: true },
      ],
    })
  })

  it('refuses an operation whose fields are not a list of names, before asking', async () => {
    const { context, records } = contextWith('approved')
    const result = await batchWriteTool().run({ operations: [{ ...batch[0], fields: 'done' }] }, context)
    expect(JSON.parse(result)).toEqual({ error: 'invalid-argument', message: 'operations[0] has fields that are not a list of field names; nothing was written.' })
    untouched(records)
  })

  it.each(['rejected', 'expired'] as const)('writes nothing when %s', async (answer) => {
    const { context, records } = contextWith(answer)
    expect(await batchWriteTool().run({ operations: batch }, context)).toBe(`The user did not approve this batch (${answer}); nothing was written.`)
    untouched(records)
  })

  it('writes and reads nothing when the client cannot be asked yet', async () => {
    const needed = new Error('The user has not answered the approval yet')
    const { context, records } = contextWith(needed)
    await expect(batchWriteTool().run({ operations: batch }, context)).rejects.toBe(needed)
    untouched(records)
  })

  it('gives a refused operation back with its index, saying nothing was written', async () => {
    const denied = new HttpProblem(403, 'access-denied', 'Forbidden', 'You may not delete this links record', { operation: 2, op: 'delete', resource: 'links' })
    const { context } = contextWith('approved', () => Promise.reject(denied))
    expect(JSON.parse(await batchWriteTool().run({ operations: batch }, context))).toEqual({
      error: 'access-denied', message: 'You may not delete this links record; nothing was written.', operation: 2, op: 'delete', resource: 'links',
    })
  })

  it('gives a stale ETag back as the precondition that failed', async () => {
    const stale = preconditionFailed('The record changed since it was read; fetch it again')
    const { context } = contextWith('approved', () => Promise.reject(new HttpProblem(stale.status, stale.slug, stale.title, stale.detail, { operation: 1, op: 'update', resource: 'tasks' })))
    expect(JSON.parse(await batchWriteTool().run({ operations: batch }, context))).toMatchObject({ error: stale.slug, operation: 1 })
  })

  it('lets a failure of the server fail the call, never reporting it as written', async () => {
    const broken = new Error('connection refused at 10.0.0.1')
    const { context } = contextWith('approved', () => Promise.reject(broken))
    await expect(batchWriteTool().run({ operations: batch }, context)).rejects.toBe(broken)
  })

  it('says a delete cannot be undone unless its resource soft deletes', async () => {
    const hard = contextWith('rejected')
    await batchWriteTool().run({ operations: batch }, hard.context)
    expect(hard.approve.mock.calls[0]![0].body).toMatch(/^1 delete cannot be undone:\n1 delete in "links"/)

    const soft = contextWith('rejected', undefined, [{ name: 'links', softDelete: 'deletedAt' }])
    await batchWriteTool().run({ operations: batch }, soft.context)
    expect(soft.approve.mock.calls[0]![0].body).not.toMatch(/cannot be undone/)
  })

  it('refuses an update that sets or clears the field a delete sets, before asking', async () => {
    for (const deleted_at of ['2026-10-23T00:00:00Z', null]) {
      const { context, approve, records } = contextWith('approved', undefined, [{ name: 'tasks', softDelete: 'deleted_at' }])
      const operations = [batch[0], { op: 'update', resource: 'tasks', key: 3, etag: '*', data: { title: 'Plan', deleted_at } }]
      expect(JSON.parse(await batchWriteTool().run({ operations }, context))).toEqual({
        error: 'forbidden', message: 'operations[1] sets deleted_at, which deleting sets; delete with a delete operation. Nothing was written.', operation: 1, op: 'update', resource: 'tasks',
      })
      expect(approve).not.toHaveBeenCalled()
      untouched(records)
    }
  })

  it('refuses an update on a resource the app does not have, before asking', async () => {
    const { context, approve } = contextWith('approved')
    context.records.softDeleteField = () => Promise.reject(notFound('There is no resource "nothing"'))
    const result = JSON.parse(await batchWriteTool().run({ operations: [{ op: 'update', resource: 'nothing', key: 1, etag: '*', data: {} }] }, context))
    expect(result).toEqual({ error: 'not-found', message: 'There is no resource "nothing"; nothing was written.' })
    expect(approve).not.toHaveBeenCalled()
  })

  describe('refuses before asking', () => {
    const refusedBeforeAsking = async (args: Record<string, unknown>, only?: string[]) => {
      const { context, approve, records } = contextWith('approved')
      const result = JSON.parse(await batchWriteTool(only && { resources: only }).run(args, context))
      expect(approve).not.toHaveBeenCalled()
      untouched(records)
      return result
    }
    const create = (resource: string) => ({ op: 'create', resource, data: {} })
    const many = (count: number) => Array.from({ length: count }, () => create('tasks'))

    it.each(['Tasks', ' tasks', 'tasks/', 'tasksX', 'tasks/../users', 'tasks%2F..%2Fusers', '__proto__', 'constructor', 'toString'])('an operation on %j outside the listed resources, first or last', async (resource) => {
      expect(await refusedBeforeAsking({ operations: [create(resource), ...many(2)] }, ['tasks'])).toMatchObject({ error: 'forbidden', operation: 0, resource })
      expect(await refusedBeforeAsking({ operations: [...many(499), create(resource)] }, ['tasks'])).toMatchObject({ error: 'forbidden', operation: 499 })
    })

    it.each([
      ['an argument outside the schema', { operations: [create('tasks')], approved: true }, /only "operations"/],
      ['a field a create does not take', { operations: [{ ...create('tasks'), force: true }] }, /operations\[0\] has fields a create does not take: "force"/],
      ['a hard delete', { operations: [{ op: 'delete', resource: 'tasks', key: 1, hard: true }] }, /"hard"/],
      ['a reorder', { operations: [{ op: 'reorder', resource: 'tasks', field: 'rank', keys: [1] }] }, /op "reorder"/],
      ['an unknown op', { operations: [{ op: 'upsert', resource: 'tasks', data: {} }] }, /op "upsert"/],
      ['no operations', { operations: [] }, /^Pass the writes/],
      ['too many operations', { operations: many(501) }, /at most 500 operations, not 501/],
      ['a key that is an object', { operations: [{ op: 'delete', resource: 'tasks', key: { id: 1 } }] }, /operations\[0\] needs the record's key/],
      ['a key that is null', { operations: [{ op: 'delete', resource: 'tasks', key: null }] }, /needs the record's key/],
      ['a delete etag that is null', { operations: [{ op: 'delete', resource: 'tasks', key: 1, etag: null }] }, /etag that is not a string/],
      ['a repeated ref', { operations: [{ ...create('tasks'), ref: 'a' }, { ...create('tasks'), ref: 'a' }] }, /ref name once/],
    ])('%s', async (_name, args, message) => {
      const result = await refusedBeforeAsking(args)
      expect(result.error).toBe('invalid-argument')
      expect(result.message).toMatch(message)
      expect(result.message).toMatch(/nothing was written\.$/)
    })

    it.each([undefined, null, '', '   '])('an update whose etag is %j, naming the operation', async (etag) => {
      const result = await refusedBeforeAsking({ operations: [create('tasks'), { op: 'update', resource: 'tasks', key: 1, data: {}, ...(etag !== undefined && { etag }) }] })
      expect(result.message).toMatch(/^operations\[1\] needs the etag/)
    })
  })

  it('asks for a batch at the operation limit', async () => {
    const { context, approve } = contextWith('rejected')
    await batchWriteTool().run({ operations: Array.from({ length: 500 }, () => ({ op: 'create', resource: 'tasks', data: {} })) }, context)
    expect(approve).toHaveBeenCalledTimes(1)
  })

  it('passes keys with path syntax and a delete without an etag exactly as sent', async () => {
    const operations = [
      { op: 'update', resource: 'tasks', key: '1/../../users/2', etag: '*', data: {} },
      { op: 'delete', resource: 'tasks', key: '1?hard=true' },
      { op: 'delete', resource: 'tasks', key: '%2F#x', etag: '' },
    ]
    const written = [{ op: 'update', resource: 'tasks', record: { id: 1 }, etag: '"v1"' }, { op: 'delete', resource: 'tasks', deleted: true }, { op: 'delete', resource: 'tasks', deleted: true }]
    const { context, records } = contextWith('approved', async () => written as never)
    await batchWriteTool().run({ operations }, context)
    expect(records.batch).toHaveBeenCalledWith(operations)
    expect('etag' in records.batch.mock.calls[0]![0][1]!).toBe(false)
  })

  it('refuses access as the records batch does, adding nothing to it', async () => {
    const { context } = contextWith('approved', () => Promise.reject(forbidden('forbidden', 'You may not update tasks')))
    expect(JSON.parse(await batchWriteTool().run({ operations: batch }, context))).toEqual({ error: 'forbidden', message: 'You may not update tasks; nothing was written.' })
  })
})
