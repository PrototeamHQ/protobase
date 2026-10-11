import { describe, expect, it } from 'vitest'
import { f, l, resource, restrictModel, view, type ResourceModel } from '@protobase/schema'
import { pruneView } from './view-access'

const customers = resource('customers').table('customers').fields({ id: f.integer(), name: f.text().filterable() }).primaryKey((r) => r.id)
const repairs = resource('repairs')
  .table('repairs')
  .fields({ id: f.integer(), customerId: f.relation('customers').filterable(), estimate: f.decimal({ precision: 8, scale: 2 }), status: f.enum(['booked', 'ready']) })
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
})
