import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { elsewhereRequest, otherOrganization } from './record-elsewhere'

const fields = { id: f.uuid().filterable(), organization_id: f.text().filterable(), name: f.text() }
const apps = resource('apps').table('apps').fields(fields).primaryKey((r) => r.id)
const across = apps.tenant((r) => r.organization_id, { across: 'memberships' }).toModel()
const key = '0b5a4f0e-6f2a-4a3c-9d4e-1f2a3b4c5d6e'

describe('elsewhereRequest', () => {
  it('finds the record by its key across the organizations, with its tenant', () => {
    expect(elsewhereRequest(across, key)).toEqual({ filter: `id = "${key}"`, pageSize: 1, fields: ['id', 'organization_id'] })
  })

  it('is none for a resource that lists one organization, or whose key it cannot filter on', () => {
    expect(elsewhereRequest(apps.tenant((r) => r.organization_id).toModel(), key)).toBeUndefined()
    const unfiltered = resource('apps').table('apps').fields({ ...fields, id: f.uuid() }).primaryKey((r) => r.id).tenant((r) => r.organization_id, { across: 'memberships' })
    expect(elsewhereRequest(unfiltered.toModel(), key)).toBeUndefined()
    const composite = resource('apps').table('apps').fields(fields).primaryKey((r) => [r.id, r.name]).tenant((r) => r.organization_id, { across: 'memberships' })
    expect(elsewhereRequest(composite.toModel(), `${key},x`)).toBeUndefined()
  })
})

describe('otherOrganization', () => {
  it('is the organization of a row found in another one', () => {
    expect(otherOrganization(across, { id: key, organization_id: 'org-2' }, 'org-1')).toBe('org-2')
    expect(otherOrganization(across, { id: key, organization_id: 7 }, '1')).toBe('7')
  })

  it('is none for a row of the current organization, or no row', () => {
    expect(otherOrganization(across, { id: key, organization_id: 'org-1' }, 'org-1')).toBeUndefined()
    expect(otherOrganization(across, undefined, 'org-1')).toBeUndefined()
  })
})
