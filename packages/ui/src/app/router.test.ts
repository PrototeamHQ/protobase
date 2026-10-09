import { describe, expect, it } from 'vitest'
import { matchRoute } from './router'

describe('matchRoute', () => {
  it('reads a list and a record', () => {
    expect(matchRoute('/orders')).toEqual({ resource: 'orders', key: undefined })
    expect(matchRoute('/orders/018b0982')).toEqual({ resource: 'orders', key: '018b0982' })
  })
  it('decodes percent-encoding and keeps composite keys', () => {
    expect(matchRoute('/orderLines/a%2Fb,2')).toEqual({ resource: 'orderLines', key: 'a/b,2' })
  })
  it('has no resource at the root', () => {
    expect(matchRoute('/')).toEqual({ resource: undefined, key: undefined })
  })
})
