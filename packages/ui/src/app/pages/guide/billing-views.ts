import { view } from '@protobase/schema'
import type { billingProfiles, invoices, paymentMethods, plans, subscriptions } from './billing-config'

// The views of the billing schema: names, labels, and the named actions the billing page's buttons run.

export const plansView = view<typeof plans>('plans').title((r) => r.name).nav({ hidden: true }).fields((r) => ({ price: r.price.prefix('€').decimals(2) }))

export const subscriptionsView = view<typeof subscriptions>('subscriptions')
  .nav({ hidden: true })
  .fields((r) => ({ renews_at: r.renews_at.label('Renews on'), status: r.status.valueLabels({ active: 'Active', canceled: 'Canceled' }) }))
  .actions((a) => [
    a.update('cancel', { label: 'Cancel plan', set: { status: 'canceled' }, confirm: 'Your plan stays active until the end of the period.' }),
    a.link('upgrade', { label: 'Upgrade', href: 'mailto:sales@example.com?subject=Upgrade%20from%20plan%20{plan}' }),
  ])

export const billingProfilesView = view<typeof billingProfiles>('billing_profiles').nav({ hidden: true }).fields((r) => ({ vat_number: r.vat_number.label('VAT number') }))

export const paymentMethodsView = view<typeof paymentMethods>('payment_methods')
  .nav({ hidden: true })
  .actions((a) => [
    a.update('makeDefault', { label: 'Make default', set: { is_default: true } }),
    a.remove('remove', { label: 'Remove', confirm: 'The card is removed from your account.' }),
  ])

export const invoicesView = view<typeof invoices>('invoices')
  .title((r) => r.number)
  .names({ singular: 'Invoice', plural: 'Invoices' })
  .fields((r) => ({ total: r.total.prefix('€').decimals(2), issued_at: r.issued_at.label('Date'), status: r.status.valueLabels({ open: 'Open', paid: 'Paid' }) }))
  .list((r) => ({ columns: [r.number, r.issued_at, r.total, r.status] }))
  .actions((a) => [a.action('download', { label: 'Download PDF' })])
