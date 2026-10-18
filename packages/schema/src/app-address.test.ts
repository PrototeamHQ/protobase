import { describe, expect, it } from 'vitest'
import { appPath, readAppPath } from './app-address'
import type { AppAddress } from './model'

const pages = new Set(['overview'])

describe('appPath', () => {
  it('writes lists, records, create forms and pages below the base path', () => {
    expect(appPath({ kind: 'list', resource: 'repairs' })).toBe('/repairs')
    expect(appPath({ kind: 'record', resource: 'repairs', key: 42 }, '/admin')).toBe('/admin/repairs/42')
    expect(appPath({ kind: 'create', resource: 'repairs' })).toBe('/repairs/new')
    expect(appPath({ kind: 'page', page: 'overview' }, '/admin')).toBe('/admin/overview')
  })

  it("writes a record's form as edit=true, and the record alone without it", () => {
    expect(appPath({ kind: 'record', resource: 'listings', key: 42, edit: true }, '/admin')).toBe('/admin/listings/42?edit=true')
    expect(appPath({ kind: 'record', resource: 'listings', key: 42, edit: false })).toBe('/listings/42')
  })

  it('writes a list state in one order, leaving out what is empty', () => {
    expect(appPath({ kind: 'list', resource: 'repairs', filterLayout: 'panel', orderBy: 'bookedOn desc', filter: 'status = "ready"', display: 'cards' })).toBe(
      '/repairs?display=cards&filter=status+%3D+%22ready%22&order_by=bookedOn+desc&layout=panel',
    )
    expect(appPath({ kind: 'list', resource: 'repairs', filter: '', display: undefined })).toBe('/repairs')
  })

  it("writes where a list's map looks as its centre and zoom, to about a metre", () => {
    expect(appPath({ kind: 'list', resource: 'listings', display: 'map', map: { latitude: 52.370216, longitude: 4.895168, zoom: 12.456 } })).toBe('/listings?display=map&map=52.37022%2C4.89517%2C12.46')
  })

  it("writes the month or week a list's calendar shows as its scale and day", () => {
    expect(appPath({ kind: 'list', resource: 'repairs', display: 'calendar', calendar: { scale: 'month', day: '2026-10-01' } })).toBe('/repairs?display=calendar&calendar=month%2C2026-10-01')
  })

  it('writes the saved search a list was opened from last', () => {
    expect(appPath({ kind: 'list', resource: 'listings', filter: 'garden = true', savedSearch: '12' })).toBe('/listings?filter=garden+%3D+true&saved_search=12')
  })

  it("writes a create form's values as its query, leaving out empty ones", () => {
    expect(appPath({ kind: 'create', resource: 'notes', values: { listing_id: '42', body: 'Big garden', title: '' } })).toBe('/notes/new?listing_id=42&body=Big+garden')
  })

  it('keeps a key with a slash or comma in one segment, and joins composite keys', () => {
    expect(appPath({ kind: 'record', resource: 'files', key: 'a/b' })).toBe('/files/a%2Fb')
    expect(appPath({ kind: 'record', resource: 'leaseTenants', key: [3, 7] })).toBe('/leaseTenants/3%2C7')
    expect(appPath({ kind: 'record', resource: 'lines', key: ['a,b', 2] })).toBe('/lines/a%252Cb%2C2')
  })
})

describe('readAppPath', () => {
  it('reads back what appPath writes', () => {
    const addresses: AppAddress[] = [
      { kind: 'list', resource: 'repairs' },
      { kind: 'list', resource: 'repairs', display: 'board', filter: 'status = "ready" AND bike : "e"', orderBy: 'bookedOn desc', filterLayout: 'panel' },
      { kind: 'list', resource: 'listings', display: 'map', map: { latitude: -33.87, longitude: 151.21, zoom: 9.5 } },
      { kind: 'list', resource: 'listings', filter: 'garden = true', savedSearch: '3,7' },
      { kind: 'list', resource: 'repairs', display: 'calendar', calendar: { scale: 'month', day: '2026-10-01' } },
      { kind: 'list', resource: 'repairs', calendar: { scale: 'week', day: '2026-10-12' } },
      { kind: 'record', resource: 'files', key: 'a/b' },
      { kind: 'record', resource: 'leaseTenants', key: '3,7' },
      { kind: 'record', resource: 'listings', key: '42', edit: true },
      { kind: 'create', resource: 'repairs' },
      { kind: 'create', resource: 'notes', values: { listing_id: '42', body: 'Big garden & a shed' } },
      { kind: 'page', page: 'overview' },
    ]
    for (const address of addresses) expect(readAppPath(appPath(address), pages)).toEqual(address)
  })

  it('reads only edit=true as the form', () => {
    expect(readAppPath('/listings/42?edit=1', pages)).toEqual({ kind: 'record', resource: 'listings', key: '42' })
    expect(readAppPath('/listings/42?edit=false', pages)).toEqual({ kind: 'record', resource: 'listings', key: '42' })
  })

  it('gives a composite key in the text form the record API takes', () => {
    expect(readAppPath(appPath({ kind: 'record', resource: 'lines', key: ['a,b', 2] }), pages)).toEqual({ kind: 'record', resource: 'lines', key: 'a%2Cb,2' })
  })

  it('ignores parameters it does not know and a filter layout it cannot use', () => {
    expect(readAppPath('/repairs?layout=grid&page=2', pages)).toEqual({ kind: 'list', resource: 'repairs' })
  })

  it('ignores a map view it cannot read or that lies off the map', () => {
    for (const map of ['52,4', '52,4,9,1', 'a,4,9', '52,,9', '91,4,9', '52,181,9', '52,4,23', '52,4,-1']) {
      expect(readAppPath(`/listings?map=${map}`, pages)).toEqual({ kind: 'list', resource: 'listings' })
    }
  })

  it('ignores a calendar view it cannot read or whose day does not exist', () => {
    for (const calendar of ['day,2026-10-01', 'month,2026-13-01', 'month,2026-02-30', 'month,2026-1-01', 'month', 'month,2026-10-01,x']) {
      expect(readAppPath(`/repairs?calendar=${calendar}`, pages)).toEqual({ kind: 'list', resource: 'repairs' })
    }
  })

  it('reads nothing at the root, under /-/, below a page, deeper than a record, or from broken encoding', () => {
    for (const path of ['/', '/-/account', '/-', '/overview/x', '/repairs/1/notes', '/repairs/%E0%A4%A']) expect(readAppPath(path, pages)).toBeUndefined()
  })
})
