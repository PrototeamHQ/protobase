import { describe, expect, it } from 'vitest'
import { openedAddress } from './opened-address'

describe('openedAddress', () => {
  const run = { kind: 'record', resource: 'workflows', key: '{{workflow_id}}', run: '{{id}}' } as const
  const channel = { kind: 'record', resource: 'channels', key: '{{channel_id}}' } as const
  const direct = { kind: 'record', resource: 'direct_messages', key: '{{direct_message_id}}' } as const

  it("fills the address a record's page opens from the record", () => {
    expect(openedAddress([run], { id: 'r1', workflow_id: 'w1' })).toEqual({ kind: 'record', resource: 'workflows', key: 'w1', run: 'r1' })
    expect(openedAddress([{ kind: 'list', resource: 'workflow_runs', filter: 'workflow_id = "{{workflow_id}}"' }], { workflow_id: 'w1' })).toEqual({ kind: 'list', resource: 'workflow_runs', filter: 'workflow_id = "w1"' })
  })

  it('takes the first choice whose fields the record holds', () => {
    expect(openedAddress([channel, direct], { channel_id: 7, direct_message_id: null })).toEqual({ kind: 'record', resource: 'channels', key: '7' })
    expect(openedAddress([channel, direct], { channel_id: null, direct_message_id: 'd1' })).toEqual({ kind: 'record', resource: 'direct_messages', key: 'd1' })
    expect(openedAddress([channel, { kind: 'page', page: 'inbox' }], { channel_id: '' })).toEqual({ kind: 'page', page: 'inbox' })
  })

  it("opens nothing when no choice's fields are all held, such as a custom step's test run of no workflow", () => {
    expect(openedAddress([run], { id: 'r2', workflow_id: null, test_step: 'custom:ocr:2' })).toBeUndefined()
    expect(openedAddress([{ kind: 'record', resource: 'workflow_versions', key: ['{{workflow_id}}', '{{version}}'] }], { workflow_id: 'w1', version: null })).toBeUndefined()
    expect(openedAddress([channel, direct], { channel_id: null })).toBeUndefined()
    expect(openedAddress([], { id: 1 })).toBeUndefined()
  })
})
