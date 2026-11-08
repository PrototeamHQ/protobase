import { describe, expect, it } from 'vitest'
import { workflowsSql } from './schema'

describe('workflowsSql', () => {
  it('adds the storage configurations table only with storage on', () => {
    expect(workflowsSql('workflows', { tables: false, storage: false })).not.toContain('"storage_configurations"')
    expect(workflowsSql('workflows', { tables: false, storage: true })).toContain('create table if not exists "workflows"."storage_configurations"')
  })

  it('leaves the base tables out of a schema that has them', () => {
    expect(workflowsSql('workflows', { tables: true, storage: false })).not.toContain('create table if not exists "workflows"."runs"')
  })
})
