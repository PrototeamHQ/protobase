import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { relationIssues } from './relation-issues'

const orders = resource('orders').table('shop.orders').fields({ id: f.integer() }).primaryKey((r) => r.id).toModel()
const orderLines = resource('order_lines')
  .table('shop.order_lines')
  .fields({ id: f.integer(), order_id: f.relation('orders') })
  .primaryKey((r) => r.id)
  .toModel()

describe('relationIssues', () => {
  it('passes a relation to a declared resource', () => {
    expect(relationIssues(orderLines, [orders, orderLines])).toEqual([])
  })

  it('reports a relation to a resource the config does not declare', () => {
    expect(relationIssues(orderLines, [orderLines])).toEqual([
      {
        severity: 'error',
        resource: 'order_lines',
        message: 'order_id: points to resource "orders", which the config does not declare',
        suggestion: 'declare it, or scaffold its table with `protobase scaffold`',
      },
    ])
  })
})
