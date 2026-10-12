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

  it('writes a list state in one order, leaving out what is empty', () => {
    expect(appPath({ kind: 'list', resource: 'repairs', filterLayout: 'panel', orderBy: 'bookedOn desc', filter: 'status = "ready"', display: 'cards' })).toBe(
      '/repairs?display=cards&filter=status+%3D+%22ready%22&order_by=bookedOn+desc&layout=panel',
    )
    expect(appPath({ kind: 'list', resource: 'repairs', filter: '', display: undefined })).toBe('/repairs')
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
      { kind: 'record', resource: 'files', key: 'a/b' },
      { kind: 'record', resource: 'leaseTenants', key: '3,7' },
      { kind: 'create', resource: 'repairs' },
      { kind: 'create', resource: 'notes', values: { listing_id: '42', body: 'Big garden & a shed' } },
      { kind: 'page', page: 'overview' },
    ]
    for (const address of addresses) expect(readAppPath(appPath(address), pages)).toEqual(address)
  })

  it('gives a composite key in the text form the record API takes', () => {
    expect(readAppPath(appPath({ kind: 'record', resource: 'lines', key: ['a,b', 2] }), pages)).toEqual({ kind: 'record', resource: 'lines', key: 'a%2Cb,2' })
  })

  it('ignores parameters it does not know and a filter layout it cannot use', () => {
    expect(readAppPath('/repairs?layout=grid&page=2', pages)).toEqual({ kind: 'list', resource: 'repairs' })
  })

  it('reads nothing at the root, under /-/, below a page, deeper than a record, or from broken encoding', () => {
    for (const path of ['/', '/-/account', '/-', '/overview/x', '/repairs/1/notes', '/repairs/%E0%A4%A']) expect(readAppPath(path, pages)).toBeUndefined()
  })
})
