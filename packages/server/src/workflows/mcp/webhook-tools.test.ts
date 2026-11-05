import { describe, expect, it, vi } from 'vitest'
import type { ToolRecords } from '../../assistant/records'
import type { ReadableResources, ToolContext } from '../../assistant/tools'
import { enableWorkflowTool } from './webhook-tools'

const readable = { models: [], views: [] } as unknown as ReadableResources

// A workflow read at `version`, and an update that echoes what it was given.
const contextAt = (version: number) => {
  const approve = vi.fn(async () => 'approved' as const)
  const update = vi.fn(async (_resource: string, _key: unknown, data: Record<string, unknown>) => ({ record: { id: 'w1', ...data }, etag: '"next"' }))
  const records = { get: async () => ({ record: { id: 'w1', name: 'Hook', version }, etag: `"v${version}"` }), update } as unknown as ToolRecords
  const context = { session: { user: { id: 1, roles: ['builder'] } }, show: () => {}, approve, records, resources: async () => readable } satisfies ToolContext
  return { context, approve, update }
}

describe('enable_workflow', () => {
  it('turns on the version it names, with the etag that version was read with', async () => {
    const { context, update } = contextAt(2)
    expect(JSON.parse(await enableWorkflowTool().run({ id: 'w1', enabled: true, version: 2 }, context))).toEqual({ id: 'w1', enabled_version: 2 })
    expect(update).toHaveBeenCalledWith('workflows', 'w1', { enabled_version: 2 }, { etag: '"v2"' })
  })

  it('refuses a version the workflow was saved past, before asking, so an approval never turns on another', async () => {
    const { context, approve, update } = contextAt(3)
    expect(JSON.parse(await enableWorkflowTool().run({ id: 'w1', enabled: true, version: 2 }, context))).toMatchObject({ error: 'precondition-failed' })
    expect(approve).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it('needs a version to turn a workflow on, and none to turn it off', async () => {
    const { context, update } = contextAt(3)
    expect(await enableWorkflowTool().run({ id: 'w1', enabled: true }, context)).toMatch(/^Pass/)
    expect(JSON.parse(await enableWorkflowTool().run({ id: 'w1', enabled: false }, context))).toEqual({ id: 'w1', enabled_version: null })
    expect(update).toHaveBeenCalledExactlyOnceWith('workflows', 'w1', { enabled_version: null }, {})
  })
})
