import { describe, expect, it, vi } from 'vitest'
import { badRequest, forbidden, notFound } from '../problem'
import type { ApprovalAnswer } from './approval'
import type { ToolRecords } from './records'
import type { ReadableResources, ToolContext } from './tools'
import { createRecordTool, updateRecordTool, writeRecordTools } from './write-record-tools'

const saved = { record: { id: 7, name: 'Acme' }, etag: '"v1"' }
const readable = {
  models: [{
    name: 'tasks',
    primaryKey: ['id'],
    fields: { id: { name: 'id', type: 'bigint' }, title: { name: 'title', type: 'text' }, status: { name: 'status', type: 'enum' }, due_on: { name: 'due_on', type: 'date' }, updated_at: { name: 'updated_at', type: 'timestamp', readOnly: true } },
  }],
  views: [{ resource: 'tasks', names: { singular: 'Task', plural: 'Tasks' }, fields: { status: { label: 'Status', valueLabels: { in_flight: 'In flight', done: 'Done' } } } }],
} as unknown as ReadableResources
const task = { record: { id: 42, title: 'Fix the sign-in lockout', status: 'in_flight', due_on: null }, etag: '"v1"' }

const contextWith = (answer: ApprovalAnswer, records: Partial<ToolRecords>) => {
  const approve = vi.fn(async () => answer)
  const context = {
    session: { user: { id: 1, roles: ['sales'] } },
    show: () => {},
    approve,
    records: { softDeleteField: async () => undefined, get: async () => task, ...records } as ToolRecords,
    resources: async () => readable,
  } satisfies ToolContext
  return { context, approve }
}

describe('write record tools', () => {
  it('create and update without destroying, then delete, in order', () => {
    expect(writeRecordTools().map((tool) => [tool.name, tool.annotations])).toEqual([
      ['create_record', { readOnlyHint: false, destructiveHint: false, openWorldHint: false }],
      ['update_record', { readOnlyHint: false, destructiveHint: false, openWorldHint: false }],
      ['delete_record', { readOnlyHint: false, destructiveHint: true, openWorldHint: false }],
    ])
  })

  it('create_record asks naming the new record and each of its fields by label, then creates it', async () => {
    const data = { title: 'Fix the sign-in lockout', status: 'in_flight', due_on: null }
    const create = vi.fn(async () => ({ record: { id: 42, ...data }, etag: '"v1"' }))
    const { context, approve } = contextWith('approved', { create })
    const result = await createRecordTool().run({ resource: 'tasks', data }, context)
    expect(approve).toHaveBeenCalledWith({
      title: 'Create Task "Fix the sign-in lockout"?',
      fields: [{ label: 'Title', value: 'Fix the sign-in lockout' }, { label: 'Status', value: 'In flight' }, { label: 'Due on', value: 'empty' }],
      approveLabel: 'Create',
      rejectLabel: 'Cancel',
    })
    expect(create).toHaveBeenCalledWith('tasks', data)
    expect(JSON.parse(result)).toEqual({ key: 42, etag: '"v1"', record: data })
  })

  it('create_record names a resource the caller cannot read by its name in words', async () => {
    const { context, approve } = contextWith('approved', { create: async () => saved })
    await createRecordTool().run({ resource: 'stock_moves', data: { qty: 3 } }, context)
    expect(approve).toHaveBeenCalledWith(expect.objectContaining({ title: 'Create Stock moves?', fields: [{ label: 'Qty', value: '3' }] }))
  })

  it.each(['rejected', 'expired'] as const)('create_record writes nothing when %s', async (answer) => {
    const create = vi.fn(async () => saved)
    const { context } = contextWith(answer, { create })
    expect(await createRecordTool().run({ resource: 'companies', data: { name: 'Acme' } }, context)).toBe(`The user did not approve this change (${answer}); nothing was written.`)
    expect(create).not.toHaveBeenCalled()
  })

  it('create_record gives a refusal back as its error and message', async () => {
    const { context } = contextWith('approved', { create: () => Promise.reject(forbidden('forbidden', 'You may not create companies')) })
    expect(JSON.parse(await createRecordTool().run({ resource: 'companies', data: {} }, context))).toEqual({ error: 'forbidden', message: 'You may not create companies' })
  })

  it('update_record asks naming the record, with each changed field before and after, then passes key, data and etag', async () => {
    const update = vi.fn(async () => ({ record: { ...task.record, ...data }, etag: '"v2"' }))
    const get = vi.fn(async () => task)
    const { context, approve } = contextWith('approved', { update, get })
    const data = { status: 'done', title: 'Fix the sign-in lockout', due_on: '2026-11-01' }
    const result = await updateRecordTool().run({ resource: 'tasks', key: 42, data, etag: '"v1"' }, context)
    expect(get).toHaveBeenCalledWith('tasks', 42)
    expect(approve).toHaveBeenCalledWith({
      title: 'Update Task #42 "Fix the sign-in lockout"?',
      fields: [{ label: 'Status', value: 'In flight -> Done' }, { label: 'Due on', value: 'empty -> 2026-11-01' }],
      approveLabel: 'Update',
      rejectLabel: 'Cancel',
    })
    expect(update).toHaveBeenCalledWith('tasks', 42, data, { etag: '"v1"' })
    expect(JSON.parse(result)).toEqual({ key: 42, etag: '"v2"', record: data })
  })

  it('update_record of one field of a large record returns its key, new etag, that field and the read-only fields it changed', async () => {
    const large = { ...task.record, notes: 'x'.repeat(100_000), updated_at: '2026-10-01T00:00:00Z' }
    const update = vi.fn(async () => ({ record: { ...large, status: 'done', updated_at: '2026-10-27T09:00:00Z' }, etag: '"v2"' }))
    const { context } = contextWith('approved', { update, get: async () => ({ record: large, etag: '"v1"' }) })
    const result = await updateRecordTool().run({ resource: 'tasks', key: 42, data: { status: 'done' } }, context)
    expect(result.length).toBeLessThan(1000)
    expect(JSON.parse(result)).toEqual({ key: 42, etag: '"v2"', record: { status: 'done', updated_at: '2026-10-27T09:00:00Z' } })
  })

  it('create_record and update_record return the fields asked for too, and the whole record for *', async () => {
    const written = { record: { id: 42, title: 'Plan', status: 'done', notes: 'Long' }, etag: '"v2"' }
    const { context } = contextWith('approved', { create: async () => written, update: async () => written })
    expect(JSON.parse(await createRecordTool().run({ resource: 'tasks', data: { title: 'Plan' }, fields: ['status'] }, context))).toEqual({ key: 42, etag: '"v2"', record: { title: 'Plan', status: 'done' } })
    expect(JSON.parse(await updateRecordTool().run({ resource: 'tasks', key: 42, data: { status: 'done' }, fields: ['*'] }, context))).toEqual({ key: 42, ...written })
  })

  it('create_record and update_record refuse fields that are not a list of names before asking', async () => {
    const { context, approve } = contextWith('approved', {})
    const refusal = { error: 'invalid-parameter', message: 'Invalid parameter fields: pass a list of field names, or ["*"] for all' }
    expect(JSON.parse(await createRecordTool().run({ resource: 'tasks', data: {}, fields: 'notes' }, context))).toEqual(refusal)
    expect(JSON.parse(await updateRecordTool().run({ resource: 'tasks', key: 42, data: {}, fields: [1] }, context))).toEqual(refusal)
    expect(approve).not.toHaveBeenCalled()
  })

  it('update_record says when no field changes, and asks in Dutch for a user who reads Dutch', async () => {
    const { context, approve } = contextWith('approved', { update: async () => saved })
    await updateRecordTool().run({ resource: 'tasks', key: 42, data: { status: 'in_flight' } }, { ...context, locale: 'nl' })
    expect(approve).toHaveBeenCalledWith({ title: 'Task #42 "Fix the sign-in lockout" bijwerken?', body: 'Er verandert geen veld.', approveLabel: 'Bijwerken', rejectLabel: 'Annuleren' })
  })

  it('update_record shows only the new values of a record the caller may not read', async () => {
    const update = vi.fn(async () => saved)
    const { context, approve } = contextWith('approved', { update, get: () => Promise.reject(forbidden('access-denied', 'You may not read tasks')) })
    await updateRecordTool().run({ resource: 'tasks', key: [3, 'a'], data: { status: 'done' } }, context)
    expect(approve).toHaveBeenCalledWith(expect.objectContaining({ title: 'Update Task #3,a?', fields: [{ label: 'Status', value: 'Done' }] }))
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('update_record refuses a record changed since the etag, or a read refused for another reason, before asking', async () => {
    const update = vi.fn(async () => saved)
    const stale = contextWith('approved', { update })
    expect(JSON.parse(await updateRecordTool().run({ resource: 'tasks', key: 42, data: { status: 'done' }, etag: '"v0"' }, stale.context))).toEqual({
      error: 'precondition-failed',
      message: 'The record changed since it was read; fetch it again',
    })
    const bad = contextWith('approved', { update, get: () => Promise.reject(badRequest('invalid-key', 'The key must be a number')) })
    expect(JSON.parse(await updateRecordTool().run({ resource: 'tasks', key: 'x', data: { status: 'done' } }, bad.context))).toEqual({ error: 'invalid-key', message: 'The key must be a number' })
    expect(stale.approve).not.toHaveBeenCalled()
    expect(bad.approve).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it('update_record refuses to set the field a delete sets, without asking', async () => {
    const update = vi.fn(async () => saved)
    const { context, approve } = contextWith('approved', { update, softDeleteField: async () => 'deleted_at' })
    for (const deleted_at of ['2026-10-23T00:00:00Z', null]) {
      expect(JSON.parse(await updateRecordTool().run({ resource: 'tasks', key: 7, data: { name: 'Acme', deleted_at } }, context))).toEqual({
        error: 'forbidden',
        message: 'update_record does not set deleted_at, which deleting sets; delete with delete_record. Nothing was written.',
      })
    }
    expect(approve).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it('update_record refuses a resource the app does not have, without asking', async () => {
    const { context, approve } = contextWith('approved', { softDeleteField: () => Promise.reject(notFound('There is no resource "nothing"')) })
    expect(JSON.parse(await updateRecordTool().run({ resource: 'nothing', key: 7, data: {} }, context))).toEqual({ error: 'not-found', message: 'There is no resource "nothing"' })
    expect(approve).not.toHaveBeenCalled()
  })

  it('both answer bad arguments with how to pass them, without asking', async () => {
    const { context, approve } = contextWith('approved', {})
    expect(await createRecordTool().run({ resource: 'companies', data: [1] }, context)).toMatch(/^Pass the resource and data/)
    expect(await createRecordTool().run({ data: {} }, context)).toMatch(/^Pass the resource and data/)
    expect(await updateRecordTool().run({ resource: 'companies', data: {} }, context)).toMatch(/^Pass the resource, key and data/)
    expect(await updateRecordTool().run({ resource: 'companies', key: 1, data: null }, context)).toMatch(/^Pass the resource, key and data/)
    expect(approve).not.toHaveBeenCalled()
  })

  describe('limited to some resources', () => {
    const only = { resources: ['tasks'] }

    it('name them in the resource parameter and the description', () => {
      for (const tool of writeRecordTools(only)) {
        expect((tool.parameters as { properties: Record<string, unknown> }).properties.resource).toEqual({ type: 'string', description: 'The resource\'s name: one of tasks.' })
        expect(tool.description).toMatch(/It writes only tasks\.$/)
      }
    })

    it('create and update a record of an allowed resource', async () => {
      const create = vi.fn(async () => saved)
      const update = vi.fn(async () => saved)
      const { context } = contextWith('approved', { create, update })
      expect(JSON.parse(await createRecordTool(only).run({ resource: 'tasks', data: { name: 'Acme' } }, context))).toEqual({ key: 7, etag: '"v1"', record: { name: 'Acme' } })
      expect(JSON.parse(await updateRecordTool(only).run({ resource: 'tasks', key: 7, data: { name: 'Acme' } }, context))).toEqual({ key: 7, etag: '"v1"', record: { name: 'Acme' } })
      expect(create).toHaveBeenCalledWith('tasks', { name: 'Acme' })
      expect(update).toHaveBeenCalledWith('tasks', 7, { name: 'Acme' }, { etag: undefined })
    })

    it('refuse any other resource without asking or writing', async () => {
      const create = vi.fn(async () => saved)
      const update = vi.fn(async () => saved)
      const { context, approve } = contextWith('approved', { create, update })
      const refusal = { error: 'forbidden', message: 'Writes over MCP reach only tasks, not companies; nothing was written.' }
      expect(JSON.parse(await createRecordTool(only).run({ resource: 'companies', data: { name: 'Acme' } }, context))).toEqual(refusal)
      expect(JSON.parse(await updateRecordTool(only).run({ resource: 'companies', key: 7, data: { name: 'Acme' } }, context))).toEqual(refusal)
      expect(approve).not.toHaveBeenCalled()
      expect(create).not.toHaveBeenCalled()
      expect(update).not.toHaveBeenCalled()
    })
  })
})
