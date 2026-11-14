import { describe, expect, it } from 'vitest'
import { appPath } from '@protobase/schema'
import { pageAddress } from './page-params'

describe('pageAddress', () => {
  it('changes one parameter and keeps the others and the tab', () => {
    const route = { page: 'claims', tab: 'recent', given: { window: '7d', claim: '3' } }
    expect(appPath(pageAddress(route, { window: '30d' }))).toBe('/claims/recent?window=30d&claim=3')
  })

  it('leaves out a parameter taken out, and writes no query without any', () => {
    expect(appPath(pageAddress({ page: 'claims', given: { window: '7d' } }, { window: undefined }))).toBe('/claims')
    expect(appPath(pageAddress({ page: 'claims', given: {} }, { claim: '' }))).toBe('/claims')
  })
})
