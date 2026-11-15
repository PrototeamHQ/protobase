import { describe, expect, it } from 'vitest'
import { openedAddress } from './record-opens'

describe('openedAddress', () => {
  const run = { kind: 'record', resource: 'workflows', key: '{{workflow_id}}', run: '{{id}}' } as const

  it("fills the address a record's page opens from the record", () => {
    expect(openedAddress(run, { id: 'r1', workflow_id: 'w1' })).toEqual({ kind: 'record', resource: 'workflows', key: 'w1', run: 'r1' })
    expect(openedAddress({ kind: 'list', resource: 'workflow_runs', filter: 'workflow_id = "{{workflow_id}}"' }, { workflow_id: null })).toMatchObject({ kind: 'list' })
  })

  it("opens nothing for a record whose field leaves the key empty, such as a custom step's test run of no workflow", () => {
    expect(openedAddress(run, { id: 'r2', workflow_id: null, test_step: 'custom:ocr:2' })).toBeUndefined()
    expect(openedAddress({ kind: 'record', resource: 'workflow_versions', key: ['{{workflow_id}}', '{{version}}'] }, { workflow_id: 'w1', version: null })).toBeUndefined()
  })
})
