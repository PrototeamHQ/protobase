import { describe, expect, it } from 'vitest'
import type { ViewModel } from '@protobase/schema'
import { withCurrentTenant } from './nav-tenant'

const view = (patch: Partial<ViewModel>): ViewModel => ({ resource: 'apps', fields: {}, layout: [], actions: [], filters: [], ...patch }) as ViewModel

describe('withCurrentTenant', () => {
  it("adds the caller's tenant to the opening filter and the recent records' filter", () => {
    const opened = withCurrentTenant(view({
      nav: { tenant: 'current', recent: { status: 'status', tones: {}, filter: 'status != "stopped"' } },
      list: { columns: ['name'], filter: 'isNull(parent_id) OR status = "failed"' },
    }), 'organization_id', 'org-1')
    expect(opened.list?.filter).toBe('(isNull(parent_id) OR status = "failed") AND organization_id = "org-1"')
    expect(opened.nav?.recent?.filter).toBe('status != "stopped" AND organization_id = "org-1"')
  })

  it('opens a list without a filter on the tenant alone, a number as a number', () => {
    expect(withCurrentTenant(view({ nav: { tenant: 'current' }, list: { columns: ['name'] } }), 'org', 7).list?.filter).toBe('org = 7')
  })

  it("narrows each named list by its own nav, and leaves the others", () => {
    const opened = withCurrentTenant(view({
      list: { columns: ['name'], filter: 'status = "running"' },
      lists: [
        { name: 'mine', names: { singular: 'App', plural: 'Apps' }, filters: [], nav: { tenant: 'current' }, list: { columns: ['name'] } },
        { name: 'all', names: { singular: 'App', plural: 'All apps' }, filters: [], list: { columns: ['name'] } },
      ],
    }), 'org', 'a')
    expect(opened.list?.filter).toBe('status = "running"')
    expect(opened.lists?.map((list) => list.list?.filter)).toEqual(['org = "a"', undefined])
  })

  it('leaves the view as it is for a caller who cannot see the tenant field, or works in no tenant', () => {
    const entry = view({ nav: { tenant: 'current' }, list: { columns: ['name'], filter: 'status = "x"' } })
    expect(withCurrentTenant(entry, undefined, 'a')).toBe(entry)
    expect(withCurrentTenant(entry, 'org', undefined)).toBe(entry)
  })
})
