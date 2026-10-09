import { f, resource } from '@protobase/schema'

// Pip's bike shop: customers bring bikes in, the workshop repairs them. Two tables of a Postgres database the
// shop already has, described as they are.

/** shop.customers */
export const customers = resource('customers')
  .table('shop.customers')
  .fields({
    id: f.integer().readOnly().filterable().sortable().dbDefault(),
    name: f.text().min(2).filterable().sortable(),
    phone: f.text().regex(/^\+?[0-9 ]{6,}$/, 'Use digits, spaces and an optional +').optional(),
    email: f.text().optional().filterable(),
    country: f.country().default('NL'),
    createdAt: f.timestamp().readOnly().filterable().sortable().dbDefault(),
  })
  .primaryKey((r) => r.id)
  .search((r) => [r.name, r.email])

/** shop.repairs */
export const repairs = resource('repairs')
  .table('shop.repairs')
  .fields({
    id: f.integer().readOnly().filterable().sortable().dbDefault(),
    number: f.text().readOnly().filterable().sortable().dbDefault(),
    customerId: f.relation('customers').filterable().sortable(),
    bike: f.text(),
    problem: f.text(),
    status: f.enum(['booked', 'waiting', 'working', 'ready', 'collected']).default('booked').filterable().sortable(),
    mechanic: f.text().optional().filterable().sortable(),
    estimate: f.decimal({ precision: 8, scale: 2 }).filterable().sortable(),
    currency: f.currency().default('EUR'),
    paid: f.boolean().default(false).filterable(),
    bookedOn: f.date().filterable().sortable(),
    notes: f.text().optional().column('internal_notes'),
    legacyRef: null,
    updatedAt: f.timestamp().readOnly().dbDefault(),
  })
  .primaryKey((r) => r.id)
  .search((r) => [r.number, r.bike, r.problem])
  .validate((repair) => (repair.status === 'collected' && !repair.paid ? [{ field: 'paid', message: 'A bike leaves the shop paid' }] : undefined))
