import { describe, expect, it } from 'vitest'
import { f } from './fields'
import type { NavRecentModel, StatusTone } from './model'
import { navRecentErrors } from './nav-recent'
import { resource } from './resource'
import { view } from './view'

const service = resource('services')
  .table('services')
  .fields({
    id: f.integer(),
    name: f.text().filterable().sortable(),
    status: f.enum(['running', 'deploying', 'stopped']).filterable(),
    updatedAt: f.timestamp().filterable().sortable(),
    notes: f.text(),
  })
  .primaryKey((r) => r.id)

const model = service.toModel()
const recent = (extra: Partial<NavRecentModel> = {}): NavRecentModel => ({ status: 'status', tones: { running: 'success', deploying: 'warning' }, ...extra })

describe('navRecentErrors', () => {
  it('accepts a status field, tones, a filter, an order and a limit', () => {
    expect(navRecentErrors(recent({ pulse: ['deploying'], filter: 'status != "stopped" OR updatedAt > now() - 7d', orderBy: 'updatedAt desc', limit: 5 }), model)).toEqual([])
  })

  it('names an unknown status field', () => {
    expect(navRecentErrors(recent({ status: 'state' }), model)).toEqual(['status field "state" does not exist'])
  })

  it('rejects tones outside the palette', () => {
    expect(navRecentErrors(recent({ tones: { running: 'green' as StatusTone } }), model)).toEqual(['tone "green" for "running" is not one of neutral, info, success, warning, danger'])
  })

  it('rejects limits outside 1 to 20', () => {
    for (const limit of [0, 21, 2.5]) expect(navRecentErrors(recent({ limit }), model)).toEqual(['limit must be a whole number from 1 to 20'])
  })

  it('checks the filter and the order like the list API does', () => {
    expect(navRecentErrors(recent({ filter: 'notes = "x"' }), model)).toEqual([expect.stringMatching(/^filter: .*notes/)])
    expect(navRecentErrors(recent({ filter: 'status = ' }), model)).toEqual([expect.stringMatching(/^filter: /)])
    expect(navRecentErrors(recent({ orderBy: 'status desc' }), model)).toEqual([expect.stringMatching(/^orderBy: .*status/)])
  })
})

describe('view nav.recent', () => {
  it('keeps the group in the view model', () => {
    const built = view<typeof service>('services').nav({ group: 'Runtime', recent: { status: 'status', tones: { running: 'success' }, limit: 3 } }).toModel(model)
    expect(built.nav).toEqual({ group: 'Runtime', recent: { status: 'status', tones: { running: 'success' }, limit: 3 } })
    // @ts-expect-error unknown status field
    view<typeof service>('services').nav({ recent: { status: 'nope', tones: {} } })
  })

  it('throws from toModel when the group does not fit the resource', () => {
    expect(() => view<typeof service>('services').nav({ recent: { status: 'status', tones: {}, orderBy: 'notes asc' } }).toModel(model)).toThrow(/View "services": nav.recent orderBy: /)
  })
})
