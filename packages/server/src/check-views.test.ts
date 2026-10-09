import { describe, expect, it } from 'vitest'
import { f, resource, view } from '@protobase/schema'
import { checkViews } from './check-views'
import type { Registry } from './registry'

const payments = resource('payments')
  .table('payments')
  .fields({ id: f.integer(), method: f.enum(['bank_transfer', 'ideal']), reference: f.text() })
  .primaryKey((r) => r.id)

const registry = { entries: [{ name: 'payments', model: payments.toModel() }] } as unknown as Registry

describe('checkViews', () => {
  it('takes labels for values of an enum', () => {
    const labelled = view<typeof payments>('payments').fields((r) => ({ method: r.method.valueLabels({ ideal: 'iDEAL' }) }))
    expect(() => checkViews(registry, [labelled.toModel()])).not.toThrow()
  })

  it('refuses labels for values the enum does not have, or on a field that is not an enum', () => {
    const stale = view<typeof payments>('payments').toModel()
    stale.fields = { method: { valueLabels: { cash: 'Cash' } }, reference: { valueLabels: { x: 'X' } } }
    expect(() => checkViews(registry, [stale])).toThrow('value label "cash" is not a value of "method"')
    expect(() => checkViews(registry, [stale])).toThrow('value labels of "reference" need an enum field')
  })
})
