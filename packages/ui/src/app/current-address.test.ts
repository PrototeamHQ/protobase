import { describe, expect, it } from 'vitest'
import { changedList, currentAddress, type ListDefaults } from './current-address'

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
})
