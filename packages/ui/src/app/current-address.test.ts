import { describe, expect, it } from 'vitest'
import { f, resource, view } from '@protobase/schema'
import { changedList, currentAddress, listDefaults, listedResource, type ListDefaults } from './current-address'

const defaults: ListDefaults = { display: 'table', orderBy: 'bookedOn desc', filterLayout: 'bar', filter: '' }

describe('currentAddress', () => {
  it('fills a list in with its defaults, where the address names none', () => {
    expect(currentAddress({ kind: 'list', resource: 'repairs', filter: 'status = "ready"' }, () => defaults)).toEqual({
      kind: 'list',
      resource: 'repairs',
      display: 'table',
      filter: 'status = "ready"',
      orderBy: 'bookedOn desc',
      filterLayout: 'bar',
    })
    expect(currentAddress({ kind: 'list', resource: 'repairs', orderBy: 'number asc', filterLayout: 'panel' }, () => defaults)).toMatchObject({ filter: '', orderBy: 'number asc', filterLayout: 'panel' })
  })

  it('gives a record key in the text form the record API takes', () => {
    expect(currentAddress({ kind: 'record', resource: 'lines', key: ['a,b', 2] }, () => defaults)).toEqual({ kind: 'record', resource: 'lines', key: 'a%2Cb,2' })
  })

  it("keeps a record's standard page", () => {
    expect(currentAddress({ kind: 'record', resource: 'channels', key: 7, standard: true }, () => defaults)).toEqual({ kind: 'record', resource: 'channels', key: '7', standard: true })
  })

  it("keeps a record's form as edit", () => {
    expect(currentAddress({ kind: 'record', resource: 'listings', key: 42, edit: true }, () => defaults)).toEqual({ kind: 'record', resource: 'listings', key: '42', edit: true })
  })

  it('leaves other addresses as they are', () => {
    expect(currentAddress({ kind: 'page', page: 'overview' }, () => defaults)).toEqual({ kind: 'page', page: 'overview' })
    expect(currentAddress(undefined, () => defaults)).toBeUndefined()
  })
})

describe('changedList', () => {
  it('keeps what the change leaves alone and writes what it sets', () => {
    expect(changedList({ kind: 'list', resource: 'repairs', filter: 'status = "ready"' }, { orderBy: 'number asc' }, defaults)).toEqual({ kind: 'list', resource: 'repairs', filter: 'status = "ready"', orderBy: 'number asc' })
  })

  it('leaves out a default or empty value, so the address of the default list stays clean', () => {
    const read = { kind: 'list', resource: 'repairs', filter: 'x = 1', orderBy: 'number asc', filterLayout: 'panel' } as const
    expect(changedList(read, { filter: '', orderBy: 'bookedOn desc', filterLayout: 'bar' }, defaults)).toEqual({ kind: 'list', resource: 'repairs' })
    expect(changedList(read, { filter: undefined, orderBy: undefined, filterLayout: undefined }, defaults)).toEqual({ kind: 'list', resource: 'repairs' })
  })

  it("keeps where the map looks until a change moves it or leaves it out, whatever else changes", () => {
    const map = { latitude: 52.37, longitude: 4.89, zoom: 12 }
    const read = { kind: 'list', resource: 'listings', display: 'map', map } as const
    expect(changedList(read, { filter: 'rooms >= 3' }, defaults)).toEqual({ ...read, filter: 'rooms >= 3' })
    expect(changedList(read, { map: { ...map, zoom: 14 } }, defaults)).toEqual({ ...read, map: { ...map, zoom: 14 } })
    expect(changedList(read, { map: undefined }, defaults)).toEqual({ kind: 'list', resource: 'listings', display: 'map' })
  })

  it('keeps the month or week a calendar shows while the filter changes, until a change moves it', () => {
    const read = { kind: 'list', resource: 'repairs', display: 'calendar', calendar: { scale: 'month', day: '2026-10-01' } } as const
    expect(changedList(read, { filter: 'mechanic = "Sem"' }, defaults)).toEqual({ ...read, filter: 'mechanic = "Sem"' })
    expect(changedList(read, { calendar: { scale: 'week', day: '2026-10-05' } }, defaults)).toEqual({ ...read, calendar: { scale: 'week', day: '2026-10-05' } })
  })

  it('keeps the period a timeline shows while the filter changes', () => {
    const read = { kind: 'list', resource: 'repairs', display: 'timeline', timeline: { scale: 'quarter', day: '2026-10-01' } } as const
    expect(changedList(read, { filter: 'mechanic = "Sem"' }, defaults)).toEqual({ ...read, filter: 'mechanic = "Sem"' })
  })

  it('keeps the saved search the list was opened from while its filters change, until a change leaves it out', () => {
    const read = { kind: 'list', resource: 'listings', filter: 'garden = true', savedSearch: '12' } as const
    expect(changedList(read, { filter: 'garden = true AND rooms >= 3' }, defaults)).toEqual({ ...read, filter: 'garden = true AND rooms >= 3' })
    expect(changedList(read, { savedSearch: '13' }, defaults)).toEqual({ ...read, savedSearch: '13' })
    expect(changedList(read, { savedSearch: undefined }, defaults)).toEqual({ kind: 'list', resource: 'listings', filter: 'garden = true' })
  })
})

describe('listDefaults', () => {
  it("opens a list in its view's default display and sort, else the table and the first key", () => {
    const repairs = resource('repairs').table('repairs').fields({ id: f.integer(), bookedOn: f.date().sortable() }).primaryKey((r) => r.id)
    const shown = view<typeof repairs>('repairs').list((r, d) => ({ columns: [r.id], sort: [[r.bookedOn, 'desc']], displays: [d.cards({})], default: 'cards' })).toModel()
    expect(listDefaults(repairs.toModel(), shown)).toEqual({ display: 'cards', orderBy: 'bookedOn desc', filterLayout: 'bar', filter: '' })
    expect(listDefaults(repairs.toModel(), undefined)).toEqual({ display: 'table', orderBy: 'id asc', filterLayout: 'bar', filter: '' })
    const tabled = view<typeof repairs>('repairs').list((r, d) => ({ columns: [r.id], displays: [d.cards({})] })).toModel()
    expect(listDefaults(repairs.toModel(), tabled).display).toBe('table')
    expect(listDefaults(repairs.toModel(), tabled, true).display).toBe('cards')
  })

  it("opens a list without a cards display in the phone's rows below sm", () => {
    const repairs = resource('repairs').table('repairs').fields({ id: f.integer(), number: f.text() }).primaryKey((r) => r.id)
    expect(listDefaults(repairs.toModel(), undefined, true).display).toBe('rows')
    expect(listDefaults(repairs.toModel(), undefined, false).display).toBe('table')
  })

  it("lists the records a view's listOf points at, with their view, when the caller can see them", () => {
    const homes = resource('homes').table('homes').fields({ id: f.integer(), address: f.text() }).primaryKey((r) => r.id)
    const saved = resource('saved').table('saved').fields({ id: f.integer(), home_id: f.relation('homes') }).primaryKey((r) => r.id)
    const homesView = view<typeof homes>('homes').toModel()
    const savedView = view<typeof saved>('saved').listOf((r) => r.home_id).toModel()
    const resources = { homes: homes.toModel(), saved: saved.toModel() }
    expect(listedResource(resources, { homes: homesView, saved: savedView }, 'saved')).toEqual({ model: resources.homes, view: homesView, listOf: true })
    expect(listedResource(resources, { homes: homesView, saved: savedView }, 'homes')).toEqual({ model: resources.homes, view: homesView, listOf: false })
    expect(listedResource({ saved: resources.saved }, { saved: savedView }, 'saved')).toEqual({ model: resources.saved, view: savedView, listOf: false })
  })
})

describe('a list that opens on a filter', () => {
  const opening = { ...defaults, filter: 'status = "todo"' }
  const read = { kind: 'list', resource: 'repairs' } as const
  it('shows the default, an empty filter as none, and a link filter as it is', () => {
    expect(currentAddress(read, () => opening)).toMatchObject({ filter: 'status = "todo"' })
    expect(currentAddress({ ...read, filter: '' }, () => opening)).toMatchObject({ filter: '' })
    expect(currentAddress({ ...read, filter: 'x = 1' }, () => opening)).toMatchObject({ filter: 'x = 1' })
  })
  it('writes a cleared filter as an empty one, and the default as nothing', () => {
    expect(changedList(read, { filter: '' }, opening)).toEqual({ ...read, filter: '' })
    expect(changedList({ ...read, filter: '' }, { filter: 'status = "todo"' }, opening)).toEqual(read)
    expect(changedList({ ...read, filter: '' }, { filter: undefined }, opening)).toEqual(read)
  })
  it('reads the default from the view', () => {
    const repairs = resource('repairs').table('repairs').fields({ id: f.integer(), status: f.text().filterable() }).primaryKey((r) => r.id)
    const shown = view<typeof repairs>('repairs').list((r) => ({ columns: [r.id], filter: 'status = "ready"' }))
    expect(listDefaults(repairs.toModel(), shown.toModel()).filter).toBe('status = "ready"')
  })
})

describe('a named list', () => {
  const repairs = resource('repairs').table('repairs').fields({ id: f.integer(), status: f.text().filterable() }).primaryKey((r) => r.id)
  const shown = view<typeof repairs>('repairs')
    .list((r) => ({ columns: [r.id] }))
    .namedList('open', (v) => v.names({ singular: 'Open', plural: 'Open' }).list((r) => ({ columns: [r.id], sort: [[r.id, 'desc']], filter: 'status = "open"' })))
    .toModel()
  const models = { repairs: repairs.toModel() }

  it('takes its defaults from its own list', () => {
    const listed = listedResource(models, { repairs: shown }, 'repairs', 'open')
    expect(listDefaults(listed.model, listed.view)).toMatchObject({ orderBy: 'id desc', filter: 'status = "open"' })
    expect(listDefaults(models.repairs, listedResource(models, { repairs: shown }, 'repairs').view).filter).toBe('')
  })

  it('stays on its list through a change', () => {
    const read = { kind: 'list', resource: 'repairs', list: 'open' } as const
    expect(changedList(read, { display: 'cards' }, defaults)).toEqual({ ...read, display: 'cards' })
  })
})
