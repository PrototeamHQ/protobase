import { f, resource } from '@protobase/schema'

// Orders show their customer's name and tier through their own relation to the customer, and each customer the name
// of their one account manager, whose record points at the customer.

/** shop.customers: one row per customer. */
export const customers = resource('customers')
  .table('shop.customers')
  .fields({
    id: f.integer().readOnly().filterable().sortable().dbDefault(),
    name: f.text().filterable().sortable(),
    tier: f.enum(['gold', 'silver', 'bronze']).filterable(),
    // From the one manager record whose customer_id is this customer; empty without one.
    manager_name: f.text().lookup({ from: 'account_managers', via: 'customer_id', field: 'name' }),
  })
  .primaryKey((r) => r.id)

/** shop.account_managers: at most one per customer, by a unique index on customer_id. */
export const accountManagers = resource('account_managers')
  .table('shop.account_managers')
  .fields({
    id: f.integer().readOnly().filterable().dbDefault(),
    customer_id: f.relation('customers').filterable(),
    name: f.text(),
  })
  .primaryKey((r) => r.id)

/** shop.orders: one row per order. */
export const orders = resource('orders')
  .table('shop.orders')
  .fields({
    id: f.integer().readOnly().filterable().sortable().dbDefault(),
    customer_id: f.relation('customers').filterable(),
    // The customer's name and tier, as the caller may read them; filtered and sorted as the customer's fields are.
    customer_name: f.text().lookup({ via: 'customer_id', field: 'name' }).filterable().sortable(),
    customer_tier: f.enum(['gold', 'silver', 'bronze']).lookup({ via: 'customer_id', field: 'tier' }).filterable(),
  })
  .primaryKey((r) => r.id)
