import { billingProfiles, invoices as invoiceResource, paymentMethods, plans, subscriptions } from './billing-config'
import { billingProfilesView, invoicesView, paymentMethodsView, plansView, subscriptionsView } from './billing-views'

// The billing schema of the guide as models, with rows for the stories.

export const billingResources = [plans, subscriptions, billingProfiles, paymentMethods, invoiceResource].map((entry) => entry.toModel())

export const billingViews = [plansView, subscriptionsView, billingProfilesView, paymentMethodsView, invoicesView].map((entry) => entry.toModel())

const invoices = Array.from({ length: 8 }, (_, index) => ({
  id: index + 1,
  number: `INV-2026-${String(10 - index).padStart(3, '0')}`,
  issued_at: `2026-${String(10 - index).padStart(2, '0')}-01`,
  total: index === 0 ? '96.00' : '72.00',
  status: index === 0 ? 'open' : 'paid',
}))

export const billingRows = {
  plans: [
    { id: 1, name: 'Starter', seats: 5, price: '29.00' },
    { id: 2, name: 'Team', seats: 10, price: '72.00' },
  ],
  subscriptions: [{ id: 1, plan: 2, status: 'active', seats_used: 9, renews_at: '2026-11-01' }],
  billing_profiles: [{ id: 1, company: 'Northwind Labs B.V.', vat_number: 'NL001234567B01', address: 'Keizersgracht 1, Amsterdam', email: 'finance@northwind.example' }],
  payment_methods: [
    { id: 1, brand: 'Visa', last4: '4242', expires: '04/28', is_default: true },
    { id: 2, brand: 'Mastercard', last4: '5454', expires: '11/27', is_default: false },
  ],
  invoices,
}

/** What the billing service does after a write: one default card at a time. */
export const billingAfterWrite = (resource: string, row: Record<string, unknown>, rows: Record<string, Array<Record<string, unknown>>>) => {
  if (resource !== 'payment_methods' || row.is_default !== true) return
  for (const card of rows.payment_methods ?? []) if (card !== row) card.is_default = false
}
