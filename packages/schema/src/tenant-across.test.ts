import { describe, expect, it } from 'vitest'
import { restrictModel } from './access/restrict'
import { f } from './fields'
import { resource } from './resource'

const apps = resource('apps')
  .table('apps')
  .fields({ id: f.uuid(), organization_id: f.text().filterable(), name: f.text() })
  .primaryKey((r) => r.id)

describe('.tenant(pick, { across })', () => {
  it('marks the lists of the resource as reading across memberships only when asked', () => {
    expect(apps.tenant((r) => r.organization_id).toModel()).not.toHaveProperty('tenantAcross')
    expect(apps.tenant((r) => r.organization_id, { across: 'memberships' }).toModel()).toMatchObject({ tenant: 'organization_id', tenantAcross: 'memberships' })
  })

  it('is dropped with the tenant field for a caller who cannot read it', () => {
    const model = apps.tenant((r) => r.organization_id, { across: 'memberships' }).toModel()
    const writable = { create: [], update: [] }
    expect(restrictModel(model, { readableFields: ['id', 'organization_id'], writableFields: writable })).toMatchObject({ tenantAcross: 'memberships' })
    const hidden = restrictModel(model, { readableFields: ['id', 'name'], writableFields: writable })
    expect(hidden).not.toHaveProperty('tenant')
    expect(hidden).not.toHaveProperty('tenantAcross')
  })
})
