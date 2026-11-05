import { describe, expect, it } from 'vitest'
import { typeCatalog } from '@protobase/workflows'
import { workflowTypes } from '../workflow-types'

describe('the type catalog', () => {
  it('lists the built-in steps and triggers as their plugin declares them, and manual', () => {
    const catalog = typeCatalog(workflowTypes().types)
    expect(catalog.step_types.map((type) => type.id)).toEqual(['app:http', 'app:records.create', 'app:records.update', 'app:records.get', 'app:records.list', 'app:mail.send', 'app:piece'])
    expect(catalog.triggers.map((type) => type.id)).toEqual(['manual', 'app:record'])
    expect(catalog.step_types[0]).toMatchObject({ kind: 'step', available: true, errors: expect.objectContaining({ 'Http.AddressRefused': 'the host is not a public address' }) })
  })

  it('says only an automatic trigger needs its workflow enabled, as run_workflow runs a disabled one', () => {
    const { note } = typeCatalog([])
    expect(note).toContain('A trigger other than manual starts runs only while its workflow is enabled')
    expect(note).toContain('a manual workflow needs no enabled_version')
  })
})
