import { describe, expect, it } from 'vitest'
import type { FieldModel, ResourceModel, ViewModel } from '@protobase/schema'
import { diffRecords } from './record-diff'

const field = (name: string, type: FieldModel['type']) => ({ name, type }) as FieldModel
const model = { name: 'orders', fields: { status: field('status', 'enum'), total: field('total', 'decimal'), updatedAt: field('updatedAt', 'timestamp') } } as unknown as ResourceModel
const view = { fields: { total: { prefix: '€', decimals: 2, label: 'Order total' }, status: { valueLabels: { draft: 'Draft', shipped: 'Shipped' } } } } as unknown as ViewModel

describe('diffRecords', () => {
  it('lists changed fields with readable values and ignores updatedAt', () => {
    const changes = diffRecords(model, view, { status: 'draft', total: '10.00', updatedAt: 'a' }, { status: 'shipped', total: '10.00', updatedAt: 'b' })
    expect(changes).toEqual([{ field: 'status', label: 'Status', before: 'Draft', after: 'Shipped' }])
  })

  it('formats with the view hints', () => {
    expect(diffRecords(model, view, { total: '10.00' }, { total: '12.5' })).toEqual([{ field: 'total', label: 'Order total', before: '€10.00', after: '€12.50' }])
  })

  it('is empty when nothing changed', () => {
    expect(diffRecords(model, view, { status: 'draft' }, { status: 'draft' })).toEqual([])
  })
})
