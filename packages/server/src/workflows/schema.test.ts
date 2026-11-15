import { describe, expect, it } from 'vitest'
import { workflowsSql } from './schema'

describe('workflowsSql', () => {
  it('adds the storage configurations table only with storage on', () => {
    expect(workflowsSql('workflows', { tables: false, storage: false })).not.toContain('"storage_configurations"')
    expect(workflowsSql('workflows', { tables: false, storage: true })).toContain('create table if not exists "workflows"."storage_configurations"')
  })

  it('adds the custom steps tables, with their runners and jobs, only with custom steps on', () => {
    const off = workflowsSql('workflows', { tables: false, storage: false })
    for (const table of ['custom_steps', 'runners', 'custom_step_jobs']) expect(off).not.toContain(`"${table}"`)
    const sql = workflowsSql('workflows', { tables: false, storage: false, customSteps: true })
    for (const table of ['custom_steps', 'custom_step_versions', 'runners', 'custom_step_jobs']) expect(sql).toContain(`create table if not exists "workflows"."${table}"`)
  })

  it('leaves the base tables out of a schema that has them', () => {
    expect(workflowsSql('workflows', { tables: true, storage: false })).not.toContain('create table if not exists "workflows"."runs"')
  })

  it('drops the steps table runs no longer keep', () => {
    expect(workflowsSql('workflows', { tables: true, storage: false })).toContain('drop table if exists "workflows"."steps"')
  })
})
