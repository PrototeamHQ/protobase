import { describe, expect, it } from 'vitest'
import type { NavRecentModel, ResourceModel, ViewModel } from '@protobase/schema'
import { recentRecords, recentRequest } from './nav-recent'

const model = { name: 'services', table: { name: 'services' }, primaryKey: ['id'], fields: { id: { name: 'id', type: 'text' }, name: { name: 'name', type: 'text' }, state: { name: 'state', type: 'enum' } } } as unknown as ResourceModel
const view = { resource: 'services', title: 'name', list: { columns: ['name'], sort: [['name', 'asc']] }, fields: {}, filters: [], layout: [], actions: [] } as unknown as ViewModel
const recent: NavRecentModel = { status: 'state', tones: { running: 'success', failed: 'danger', deploying: 'warning' }, pulse: ['deploying'] }

describe('recentRequest', () => {
  it('defaults to the list sort, three records and only the fields it shows', () => {
    expect(recentRequest(model, view, recent)).toEqual({ filter: '', orderBy: 'name asc', pageSize: 3, fields: ['id', 'name', 'state'] })
  })

  it('uses the configured filter, order and limit', () => {
    expect(recentRequest(model, view, { ...recent, filter: 'state != "stopped"', orderBy: 'name desc', limit: 5 })).toMatchObject({ filter: 'state != "stopped"', orderBy: 'name desc', pageSize: 5 })
  })
})

describe('recentRecords', () => {
  const rows = [
    { id: 's1', name: 'api', state: 'running' },
    { id: 's2', name: 'worker', state: 'deploying' },
    { id: 's/3', name: null, state: 'paused' },
  ]

  it('titles, links and colours each record', () => {
    expect(recentRecords(model, view, recent, rows, '/admin', 's2')).toEqual([
      { id: 's1', label: 'api', href: '/admin/services/s1', status: 'running', tone: 'success', pulse: false, active: false },
      { id: 's2', label: 'worker', href: '/admin/services/s2', status: 'deploying', tone: 'warning', pulse: true, active: true },
      { id: 's/3', label: 's/3', href: '/admin/services/s%2F3', status: 'paused', tone: 'neutral', pulse: false, active: false },
    ])
  })

  it("shows the status by the view's value label", () => {
    const labelled = { ...view, fields: { state: { valueLabels: { deploying: 'Rolling out' } } } } as ViewModel
    expect(recentRecords(model, labelled, recent, rows, '/admin', undefined)[1]).toMatchObject({ status: 'Rolling out', tone: 'warning', pulse: true })
  })
})
