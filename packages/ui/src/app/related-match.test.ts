import { describe, expect, it } from 'vitest'
import type { RelatedModel, ResourceModel } from '@protobase/schema'
import { relatedMatch } from './related-match'

const item = (o: Partial<RelatedModel> = {}): RelatedModel => ({ kind: 'related', title: 'Tasks', resource: 'tasks', field: 'objective_id', ...o })
const links = { name: 'lease_tenants', primaryKey: ['id'] } as unknown as ResourceModel

describe('relatedMatch', () => {
  it('matches the field on the value, with the filter beside it', () => {
    expect(relatedMatch(item(), 7, {})).toBe('objective_id = 7')
    expect(relatedMatch(item({ filter: 'done = false' }), 7, {})).toBe('(objective_id = 7) AND (done = false)')
  })

  it('matches nothing without a value', () => {
    expect(relatedMatch(item(), null, {})).toBeNull()
  })

  it('goes through the join records, by their primary key when no key is named', () => {
    const through = item({ resource: 'leases', field: 'id', through: { resource: 'lease_tenants', field: 'tenant_id' } })
    expect(relatedMatch(through, 'a', { lease_tenants: links })).toContain('lease_tenants')
    expect(relatedMatch(through, 'a', {})).toBeNull()
  })
})
