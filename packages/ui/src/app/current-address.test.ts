import { describe, expect, it } from 'vitest'
import { f, resource, view } from '@protobase/schema'
import { changedList, currentAddress, listDefaults, listedResource, type ListDefaults } from './current-address'

const defaults: ListDefaults = { display: 'table', orderBy: 'bookedOn desc', filterLayout: 'bar' }

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
    expect(listDefaults(repairs.toModel(), shown)).toEqual({ display: 'cards', orderBy: 'bookedOn desc', filterLayout: 'bar' })
    expect(listDefaults(repairs.toModel(), undefined)).toEqual({ display: 'table', orderBy: 'id asc', filterLayout: 'bar' })
    const tabled = view<typeof repairs>('repairs').list((r, d) => ({ columns: [r.id], displays: [d.cards({})] })).toModel()
    expect(listDefaults(repairs.toModel(), tabled).display).toBe('table')
    expect(listDefaults(repairs.toModel(), tabled, true).display).toBe('cards')
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
