import { billingProfiles, invoices as invoiceResource, paymentMethods, plans, subscriptions } from './billing-config'
import { billingProfilesView, invoicesView, paymentMethodsView, plansView, subscriptionsView } from './billing-views'

// The billing schema of the guide as models, with rows for the stories.

export const billingResources = [plans, subscriptions, billingProfiles, paymentMethods, invoiceResource].map((entry) => entry.toModel())

export const billingViews = [plansView, subscriptionsView, billingProfilesView, paymentMethodsView, invoicesView].map((entry) => entry.toModel())

const invoices = Array.from({ length: 8 }, (_, index) => ({
  id: index + 1,
  number: `INV-2026-${String(10 - index).padStart(3, '0')}`,
  issuedAt: `2026-${String(10 - index).padStart(2, '0')}-01`,
  total: index === 0 ? '96.00' : '72.00',
  status: index === 0 ? 'open' : 'paid',
}))

export const billingRows = {
  plans: [
    { id: 1, name: 'Starter', seats: 5, price: '29.00' },
    { id: 2, name: 'Team', seats: 10, price: '72.00' },
  ],
  subscriptions: [{ id: 1, plan: 2, status: 'active', seatsUsed: 9, renewsAt: '2026-11-01' }],
  billingProfiles: [{ id: 1, company: 'Northwind Labs B.V.', vatNumber: 'NL001234567B01', address: 'Keizersgracht 1, Amsterdam', email: 'finance@northwind.example' }],
  paymentMethods: [
    { id: 1, brand: 'Visa', last4: '4242', expires: '04/28', isDefault: true },
    { id: 2, brand: 'Mastercard', last4: '5454', expires: '11/27', isDefault: false },
  ],
  invoices,
}

/** What the billing service does after a write: one default card at a time. */
export const billingAfterWrite = (resource: string, row: Record<string, unknown>, rows: Record<string, Array<Record<string, unknown>>>) => {
  if (resource !== 'paymentMethods' || row.isDefault !== true) return
  for (const card of rows.paymentMethods ?? []) if (card !== row) card.isDefault = false
}
