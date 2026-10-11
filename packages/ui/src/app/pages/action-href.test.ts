import { describe, expect, it } from 'vitest'
import { fillHref } from './action-href'

describe('fillHref', () => {
  it('fills fields from the record, percent-encoded', () => {
    expect(fillHref('https://maps.example/{orderId}?from={city}', { orderId: 42, city: 'Den Haag' })).toBe('https://maps.example/42?from=Den%20Haag')
  })

  it('leaves missing values empty and other braces alone', () => {
    expect(fillHref('https://pay.example/{plan}/{ nope }', { plan: null })).toBe('https://pay.example//{ nope }')
  })
})
