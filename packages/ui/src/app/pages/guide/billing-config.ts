import { f, resource, view } from '@protobase/schema'

// The billing schema of the "A billing page" guide: what a hosting provider keeps per customer.

export const plans = resource('plans')
  .table('billing.plans')
  .fields({ id: f.integer().readOnly().filterable().sortable(), name: f.text(), seats: f.integer(), price: f.decimal({ precision: 8, scale: 2 }) })
  .primaryKey((r) => r.id)

export const subscriptions = resource('subscriptions')
  .table('billing.subscriptions')
  .fields({
    id: f.integer().readOnly().filterable().sortable(),
    plan: f.relation('plans'),
    status: f.enum(['active', 'canceled']).filterable(),
    seats_used: f.integer(),
    renews_at: f.date(),
  })
  .primaryKey((r) => r.id)

export const billingProfiles = resource('billing_profiles')
  .table('billing.billing_profiles')
  .fields({ id: f.integer().readOnly().filterable().sortable(), company: f.text(), vat_number: f.text().optional(), address: f.text(), email: f.text() })
  .primaryKey((r) => r.id)

export const paymentMethods = resource('payment_methods')
  .table('billing.payment_methods')
  .fields({ id: f.integer().readOnly().filterable().sortable(), brand: f.text(), last4: f.text(), expires: f.text(), is_default: f.boolean().default(false).filterable().sortable() })
  .primaryKey((r) => r.id)

export const invoices = resource('invoices')
  .table('billing.invoices')
  .fields({
    id: f.integer().readOnly().filterable().sortable(),
    number: f.text(),
    issued_at: f.date().filterable().sortable(),
    total: f.decimal({ precision: 10, scale: 2 }).readOnly(),
    status: f.enum(['open', 'paid']).filterable(),
  })
  .primaryKey((r) => r.id)
