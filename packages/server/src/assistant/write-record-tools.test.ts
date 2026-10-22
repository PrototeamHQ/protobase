import { describe, expect, it, vi } from 'vitest'
import { forbidden } from '../problem'
import type { ApprovalAnswer } from './approval'
import type { ToolRecords } from './records'
import type { ToolContext } from './tools'
import { createRecordTool, updateRecordTool, writeRecordTools } from './write-record-tools'

const saved = { record: { id: 7, name: 'Acme' }, etag: '"v1"' }

const contextWith = (answer: ApprovalAnswer, records: Partial<ToolRecords>) => {
  const approve = vi.fn(async () => answer)
  const context = {
    session: { user: { id: 1, roles: ['sales'] } },
    show: () => {},
    approve,
    records: records as ToolRecords,
    resources: async () => ({ models: [], views: [] }),
  } satisfies ToolContext
  return { context, approve }
}

describe('write record tools', () => {
  it('write without destroying, in order', () => {
    expect(writeRecordTools().map((tool) => [tool.name, tool.annotations])).toEqual([
      ['create_record', { readOnlyHint: false, destructiveHint: false, openWorldHint: false }],
      ['update_record', { readOnlyHint: false, destructiveHint: false, openWorldHint: false }],
    ])
  })

  it('create_record asks with the resource and data, then creates the record', async () => {
    const create = vi.fn(async () => saved)
    const { context, approve } = contextWith('approved', { create })
    const result = await createRecordTool().run({ resource: 'companies', data: { name: 'Acme' } }, context)
    expect(approve).toHaveBeenCalledWith({ title: 'Create a record in companies?', code: JSON.stringify({ name: 'Acme' }, null, 2), approveLabel: 'Create' })
    expect(create).toHaveBeenCalledWith('companies', { name: 'Acme' })
    expect(JSON.parse(result)).toEqual(saved)
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

  it('update_record asks with the key, then passes key, data and etag', async () => {
    const update = vi.fn(async () => saved)
    const { context, approve } = contextWith('approved', { update })
    const result = await updateRecordTool().run({ resource: 'members', key: [3, 'a'], data: { name: 'Acme' }, etag: '"v0"' }, context)
    expect(approve).toHaveBeenCalledWith(expect.objectContaining({ title: 'Update members 3,a?', approveLabel: 'Update' }))
    expect(update).toHaveBeenCalledWith('members', [3, 'a'], { name: 'Acme' }, { etag: '"v0"' })
    expect(JSON.parse(result)).toEqual(saved)
  })

  it('both answer bad arguments with how to pass them, without asking', async () => {
    const { context, approve } = contextWith('approved', {})
    expect(await createRecordTool().run({ resource: 'companies', data: [1] }, context)).toMatch(/^Pass the resource and data/)
    expect(await createRecordTool().run({ data: {} }, context)).toMatch(/^Pass the resource and data/)
    expect(await updateRecordTool().run({ resource: 'companies', data: {} }, context)).toMatch(/^Pass the resource, key and data/)
    expect(await updateRecordTool().run({ resource: 'companies', key: 1, data: null }, context)).toMatch(/^Pass the resource, key and data/)
    expect(approve).not.toHaveBeenCalled()
  })
})
