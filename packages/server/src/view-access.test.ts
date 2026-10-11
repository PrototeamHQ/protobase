import { describe, expect, it } from 'vitest'
import { f, l, resource, restrictModel, view, type ResourceModel } from '@protobase/schema'
import { pruneView } from './view-access'

const customers = resource('customers').table('customers').fields({ id: f.integer(), name: f.text().filterable() }).primaryKey((r) => r.id)
const repairs = resource('repairs')
  .table('repairs')
  .fields({
    id: f.integer(),
    number: f.text().filterable().sortable(),
    customerId: f.relation('customers').filterable(),
    estimate: f.decimal({ precision: 8, scale: 2 }),
    costPrice: f.decimal({ precision: 8, scale: 2 }).filterable().sortable(),
    status: f.enum(['booked', 'ready']).filterable(),
    bookedOn: f.timestamp().sortable(),
  })
  .primaryKey((r) => r.id)

const all = { customers: customers.toModel(), repairs: repairs.toModel() }

// The models as a caller who cannot read `hidden` and cannot see the `gone` resources gets them, as `/meta` does.
const without = (hidden: Record<string, string[]>, gone: string[] = []): Record<string, ResourceModel> =>
  Object.fromEntries(
    Object.entries(all)
      .filter(([name]) => !gone.includes(name))
      .map(([name, model]) => {
        const readableFields = Object.keys(model.fields).filter((field) => !hidden[name]?.includes(field))
        return [name, restrictModel(model, { readableFields, writableFields: { create: readableFields, update: readableFields } })]
      }),
  )

describe('pruneView', () => {
  it('leaves out links that read a hidden field or lead where the caller cannot go', () => {
    const repairsView = view<typeof repairs>('repairs')
      .actions((a) => [
        a.link('customer', { label: 'Customer', to: { kind: 'record', resource: 'customers', key: '{customerId}' } }),
        a.link('sameCustomer', { label: 'Same customer', to: { kind: 'list', resource: 'repairs', filter: 'customerId = {customerId}' } }),
        a.link('quote', { label: 'Quote', href: 'https://quotes.example/{estimate}' }),
      ])
      .toModel()
    const names = (models: Record<string, ResourceModel>) => pruneView(repairsView, models.repairs!, models).actions.map((action) => action.name)
    expect(names(all)).toEqual(['customer', 'sameCustomer', 'quote'])
    expect(names(without({ repairs: ['estimate'] }))).toEqual(['customer', 'sameCustomer'])
    expect(names(without({}, ['customers']))).toEqual(['sameCustomer', 'quote'])
    expect(names(without({ repairs: ['customerId'] }))).toEqual(['quote'])
  })

  it('leaves out a custom section whose props name a field the caller cannot read', () => {
    const Quote = Object.assign((props: { amount: string; currency: string }) => props, { blockName: 'Quote', custom: true })
    const repairsView = view<typeof repairs>('repairs').layout((r) => [l.custom(Quote, { props: { amount: r.estimate, currency: 'EUR' } }), l.section('Repair', [r.status, r.estimate])]).toModel()
    expect(pruneView(repairsView, all.repairs, all).layout).toEqual(repairsView.layout)
    const hidden = without({ repairs: ['estimate'] })
    expect(pruneView(repairsView, hidden.repairs!, hidden).layout).toEqual([{ kind: 'section', title: 'Repair', fields: ['status'] }])
  })

  it('never sends a hidden field, wherever a view names it: lists, displays, sections and custom props', () => {
    const Board = Object.assign((props: { by: string; size: number }) => props, { blockName: 'Board', custom: true })
    const Margin = Object.assign((props: { cost: string }) => props, { blockName: 'Margin', custom: true })
    const everywhere = view<typeof repairs>('repairs')
      .title((r) => r.costPrice)
      .searchResult((r) => ({ title: [r.number, r.costPrice], subtitle: r.costPrice }))
      .nav({ recent: { status: 'costPrice', tones: {} } })
      .fields((r) => ({ costPrice: r.costPrice.label('Cost price'), number: r.number.label('Number') }))
      .list((r, d) => ({
        columns: [r.number, r.costPrice],
        sort: [[r.costPrice, 'desc'], [r.bookedOn, 'asc']],
        search: [r.number, r.costPrice],
        displays: [
          d.cards({ title: r.number, subtitle: r.costPrice, badge: r.status, meta: [r.costPrice, r.bookedOn] }),
          d.custom(Board, { name: 'board', label: 'Board', fields: [r.number, r.costPrice], props: { by: r.status, size: 3 } }),
          d.custom(Board, { name: 'costs', label: 'Costs', fields: [r.number], props: { by: r.costPrice, size: 3 } }),
        ],
        default: 'costs',
      }))
      .filters((r, w) => [w.range(r.costPrice), w.facets(r.status)])
      .chart((r) => ({ field: r.costPrice, range: '30d', granularity: 'day' }))
      .layout((r) => [
        l.section('Repair', [r.number, r.costPrice]),
        l.section('Money', [r.costPrice]),
        l.custom(Margin, { title: 'Margin', props: { cost: r.costPrice } }),
        l.custom(Board, { props: { by: r.status, size: 1 } }),
        l.sidebar([r.status, r.costPrice]),
      ])
      .actions((a) => [
        a.update('zero', { label: 'Zero', set: { costPrice: 0 } }),
        a.link('cheaper', { label: 'Cheaper', to: { kind: 'list', resource: 'repairs', filter: 'costPrice < {costPrice}' } }),
        a.link('quote', { label: 'Quote', href: 'https://quotes.example/{costPrice}' }),
        a.update('ready', { label: 'Ready', set: { status: 'ready' } }),
      ])
      .toModel()
    const hidden = without({ repairs: ['costPrice'] })
    const pruned = pruneView(everywhere, hidden.repairs!, hidden)
    expect(JSON.stringify(pruned)).not.toContain('costPrice')
    expect(pruned.list).toEqual({
      columns: ['number'],
      sort: [['bookedOn', 'asc']],
      search: ['number'],
      displays: [
        { kind: 'cards', name: 'cards', title: 'number', badge: 'status', meta: ['bookedOn'] },
        { kind: 'custom', name: 'board', label: 'Board', component: 'Board', fields: ['number'], props: { by: { $field: 'status' }, size: 3 } },
      ],
    })
    expect(pruned.layout.map((item) => (item.kind === 'custom' ? item.component : item.kind))).toEqual(['section', 'Board', 'sidebar'])
    expect(pruned.actions.map((action) => action.name)).toEqual(['ready'])
    expect(pruneView(everywhere, all.repairs, all)).toEqual(everywhere)
  })
})
