import { describe, expect, it } from 'vitest'
import { fillHref, isAppPath } from './action-href'

describe('fillHref', () => {
  it('fills fields from the record, percent-encoded', () => {
    expect(fillHref('/orders/{orderId}?from={city}', { orderId: 42, city: 'Den Haag' })).toBe('/orders/42?from=Den%20Haag')
  })

  it('leaves missing values empty and other braces alone', () => {
    expect(fillHref('https://pay.example/{plan}/{ nope }', { plan: null })).toBe('https://pay.example//{ nope }')
  })
})

describe('isAppPath', () => {
  it('tells app paths from links that leave the app', () => {
    expect([isAppPath('/billing'), isAppPath('//evil.example'), isAppPath('mailto:a@b.c'), isAppPath('https://x.y')]).toEqual([true, false, false, false])
  })
})
