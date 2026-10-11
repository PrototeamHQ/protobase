import { describe, expect, it } from 'vitest'
import { f, resource, view, type AppAddress } from '@protobase/schema'
import { checkViews } from './check-views'
import type { Registry } from './registry'

const payments = resource('payments')
  .table('payments')
  .fields({ id: f.integer(), method: f.enum(['bank_transfer', 'ideal']).filterable(), reference: f.text(), iban: f.text().sensitive() })
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

  it('wants links to go to addresses the app has, or out of it', () => {
    const linked = (to: AppAddress) => view<typeof payments>('payments').actions((a) => [a.link('go', { label: 'Go', to })]).toModel()
    expect(() => checkViews(registry, [linked({ kind: 'list', resource: 'payments', filter: 'method = "{method}"' })])).not.toThrow()
    expect(() => checkViews(registry, [linked({ kind: 'page', page: 'overview' })], ['overview'])).not.toThrow()
    expect(() => checkViews(registry, [linked({ kind: 'list', resource: 'refunds' })])).toThrow('View "payments": action "go": unknown resource "refunds"')
    expect(() => checkViews(registry, [linked({ kind: 'page', page: 'overview' })])).toThrow('action "go": unknown page "overview"')
    expect(() => checkViews(registry, [linked({ kind: 'record', resource: 'payments', key: '{iban}' })])).toThrow('sensitive field "iban" cannot be in an action')
    const written = view<typeof payments>('payments').toModel()
    written.actions = [{ name: 'old', label: 'Old', bulk: false, run: { kind: 'link', href: '/payments/{id}' } }]
    expect(() => checkViews(registry, [written])).toThrow('action "old": href "/payments/{id}" points inside the app; give the link `to` instead')
  })

  it('wants list displays to show fields the resource has, none of them sensitive', () => {
    const Board = Object.assign((props: { by: string }) => props, { blockName: 'Board', custom: true })
    const shown = view<typeof payments>('payments').list((r, d) => ({ columns: [r.reference], displays: [d.cards({ badge: r.method }), d.custom(Board, { name: 'board', label: 'Board', fields: [r.reference], props: { by: r.iban } })] }))
    expect(() => checkViews(registry, [shown.toModel()])).toThrow('View "payments": sensitive field "iban" cannot be in a list display')
    const stale = view<typeof payments>('payments').toModel()
    stale.list = { columns: ['reference'], displays: [{ kind: 'cards', name: 'cards', meta: ['paidOn'] }] }
    expect(() => checkViews(registry, [stale])).toThrow('View "payments": display "cards" names field "paidOn", which payments does not have')
  })

  it('wants a custom section to name fields the resource has', () => {
    const stale = view<typeof payments>('payments').toModel()
    stale.layout = [{ kind: 'custom', component: 'Receipt', props: { amount: { $field: 'amount' }, currency: 'EUR' } }]
    expect(() => checkViews(registry, [stale])).toThrow('View "payments": custom section Receipt names field "amount", which payments does not have')
  })
})
