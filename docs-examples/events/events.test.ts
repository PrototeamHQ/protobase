import { describe, expect, it } from 'vitest'
import { orders } from './orders'

// The documentation shows this file; this keeps what it says about it true.

describe('the events of orders', () => {
  it('has a catalogue of every event, by full name', () => {
    expect(orders.toModel().events!.map((event) => event.name)).toEqual([
      'orders.created',
      'orders.updated',
      'orders.deleted',
      'orders.undeleted',
      'orders.large',
      'orders.statusChanged',
      'orders.refundAccountChanged',
      'orders.reopened',
      'orders.rush',
    ])
  })

  it('keeps the code predicate out of the catalogue', () => {
    expect(orders.toModel().events!.at(-1)).toEqual({ name: 'orders.rush', operations: ['create'], match: true })
    expect(Object.keys(orders.eventMatches())).toEqual(['orders.rush'])
  })
})
