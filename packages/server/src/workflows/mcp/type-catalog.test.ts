import { describe, expect, it } from 'vitest'
import { workflowTypes } from '../workflow-types'
import { typeCatalog } from './type-catalog'

describe('the type catalog', () => {
  it('lists the built-in steps and triggers as their plugin declares them, and manual', () => {
    const catalog = typeCatalog(workflowTypes().types)
    expect(catalog.step_types.map((type) => type.id)).toEqual(['app:http', 'app:records.create', 'app:records.update', 'app:records.get', 'app:records.list', 'app:mail.send', 'app:piece'])
    expect(catalog.triggers.map((type) => type.id)).toEqual(['manual', 'app:record'])
    expect(catalog.step_types[0]).toMatchObject({ kind: 'step', available: true, errors: expect.objectContaining({ 'Http.AddressRefused': 'the host is not a public address' }) })
  })
})
