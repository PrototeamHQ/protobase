import { describe, expect, it } from 'vitest'
import { orders, ordersView } from './orders'
import project from './protobase.config'

// The documentation shows these files; this keeps what it says about them true.

describe('the history of orders', () => {
  it('keeps every change and shows it last on the order page', () => {
    expect(orders.toModel().history).toBe(true)
    expect(ordersView.toModel().layout.at(-1)).toEqual({ kind: 'history', title: 'History' })
  })

  it('keeps 90 days', () => {
    expect(project.history).toEqual({ days: 90 })
  })
})
