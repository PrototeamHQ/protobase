import { describe, expect, it } from 'vitest'
import type { NavRecentModel, ResourceModel, ViewModel } from '@protobase/schema'
import { recentMarks, recentRecords, recentRequest, recentRowDiffers } from './nav-recent'
import { recordTitleOf } from './titles/record-title-of'

const model = { name: 'services', table: { name: 'services' }, primaryKey: ['id'], fields: { id: { name: 'id', type: 'text' }, name: { name: 'name', type: 'text' }, state: { name: 'state', type: 'enum' } } } as unknown as ResourceModel
const view = { resource: 'services', title: 'name', list: { columns: ['name'], sort: [['name', 'asc']] }, fields: {}, filters: [], layout: [], actions: [] } as unknown as ViewModel
const stored = recordTitleOf({}, { user: undefined, member: () => undefined })
const recent: NavRecentModel = { status: 'state', tones: { running: 'success', failed: 'danger', deploying: 'warning' }, pulse: ['deploying'] }

describe('recentRequest', () => {
  it('defaults to the list sort, three records and only the fields it shows', () => {
    expect(recentRequest(model, view, recent)).toEqual({ filter: '', orderBy: 'name asc', pageSize: 3, fields: ['id', 'name', 'state'] })
  })

  it('asks for no status field in a group without one', () => {
    expect(recentRequest(model, view, { limit: 20 })).toMatchObject({ pageSize: 20, fields: ['id', 'name'] })
  })

  it('asks for the fields a derived title reads', () => {
    const derived = { ...view, titleFrom: { rule: 'members', fields: ['state'] } } as ViewModel
    expect(recentRequest(model, derived, { limit: 5 }).fields).toEqual(['id', 'name', 'state'])
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
    expect(recentRecords(model, view, recent, rows, '/admin', 's2', stored)).toEqual([
      { id: 's1', label: 'api', href: '/admin/services/s1', status: { label: 'running', tone: 'success', pulse: false }, active: false },
      { id: 's2', label: 'worker', href: '/admin/services/s2', status: { label: 'deploying', tone: 'warning', pulse: true }, active: true },
      { id: 's/3', label: 's/3', href: '/admin/services/s%2F3', status: { label: 'paused', tone: 'neutral', pulse: false }, active: false },
    ])
  })

  it("titles each record for the reader by the view's derived title", () => {
    const derived = { ...view, titleFrom: { rule: 'owner', fields: ['name'] } } as ViewModel
    const titleOf = recordTitleOf({ owner: (row, reader) => `${row.name} for ${reader.user?.name}` }, { user: { id: 'u-maya', name: 'Maya' } as never, member: () => undefined })
    expect(recentRecords(model, derived, { orderBy: 'name asc' }, rows, '/admin', undefined, titleOf).map((record) => record.label)).toEqual(['api for Maya', 'worker for Maya', 'null for Maya'])
  })

  it('leaves the status out in a group without a status field', () => {
    expect(recentRecords(model, view, { orderBy: 'name asc' }, rows, '/admin', 's1', stored)[0]).toEqual({ id: 's1', label: 'api', href: '/admin/services/s1', active: true })
  })

  it("shows the status by the view's value label", () => {
    const labelled = { ...view, fields: { state: { valueLabels: { deploying: 'Rolling out' } } } } as ViewModel
    expect(recentRecords(model, labelled, recent, rows, '/admin', undefined, stored)[1]).toMatchObject({ status: { label: 'Rolling out', tone: 'warning', pulse: true } })
  })
})

describe('recentRowDiffers', () => {
  const rows = [{ id: 's1', name: 'api', state: 'deploying' }]
  const fields = ['id', 'name', 'state']

  it('is true when the record now shows another status or title than its row', () => {
    expect(recentRowDiffers(model, fields, rows, 's1', { id: 's1', name: 'api', state: 'running', url: 'https://api.test' })).toBe(true)
    expect(recentRowDiffers(model, fields, rows, 's1', { id: 's1', name: 'gateway', state: 'deploying' })).toBe(true)
  })

  it('is false when the shown fields are unchanged or the record is not in the group', () => {
    expect(recentRowDiffers(model, fields, rows, 's1', { id: 's1', name: 'api', state: 'deploying', url: 'https://api.test' })).toBe(false)
    expect(recentRowDiffers(model, fields, rows, 's9', { id: 's9', name: 'other', state: 'running' })).toBe(false)
  })
})

describe('recentMarks', () => {
  const unread = (resource: string) => (resource === 'services' ? { s1: { strong: true, count: 2 } } : undefined)

  it("calls the project UI's hook the group names with the group's resource", () => {
    const useMarks = recentMarks('services', { marks: 'unread' }, { unread })
    expect(useMarks?.()).toEqual({ s1: { strong: true, count: 2 } })
  })

  it('marks nothing for a group without marks, or one naming a hook no UI config registers', () => {
    expect(recentMarks('services', {}, { unread })).toBeUndefined()
    expect(recentMarks('services', { marks: 'starred' }, { unread })).toBeUndefined()
    expect(recentMarks('services', { marks: 'unread' }, undefined)).toBeUndefined()
    expect(recentMarks('services', { marks: 'toString' }, {})).toBeUndefined()
  })
})

