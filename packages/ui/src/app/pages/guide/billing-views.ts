import { view } from '@protobase/schema'
import type { billingProfiles, invoices, paymentMethods, plans, subscriptions } from './billing-config'

// The views of the billing schema: names, labels, and the named actions the billing page's buttons run.

export const plansView = view<typeof plans>('plans').title((r) => r.name).nav({ hidden: true }).fields((r) => ({ price: r.price.prefix('€').decimals(2) }))

export const subscriptionsView = view<typeof subscriptions>('subscriptions')
  .nav({ hidden: true })
  .fields((r) => ({ renewsAt: r.renewsAt.label('Renews on'), status: r.status.valueLabels({ active: 'Active', canceled: 'Canceled' }) }))
  .actions((a) => [
    a.update('cancel', { label: 'Cancel plan', set: { status: 'canceled' }, confirm: 'Your plan stays active until the end of the period.' }),
    a.link('upgrade', { label: 'Upgrade', href: 'mailto:sales@example.com?subject=Upgrade%20from%20plan%20{plan}' }),
  ])

export const billingProfilesView = view<typeof billingProfiles>('billingProfiles').nav({ hidden: true }).fields((r) => ({ vatNumber: r.vatNumber.label('VAT number') }))

export const paymentMethodsView = view<typeof paymentMethods>('paymentMethods')
  .nav({ hidden: true })
  .actions((a) => [
    a.update('makeDefault', { label: 'Make default', set: { isDefault: true } }),
    a.remove('remove', { label: 'Remove', confirm: 'The card is removed from your account.' }),
  ])

export const invoicesView = view<typeof invoices>('invoices')
  .title((r) => r.number)
  .names({ singular: 'Invoice', plural: 'Invoices' })
  .fields((r) => ({ total: r.total.prefix('€').decimals(2), issuedAt: r.issuedAt.label('Date'), status: r.status.valueLabels({ open: 'Open', paid: 'Paid' }) }))
  .list((r) => ({ columns: [r.number, r.issuedAt, r.total, r.status] }))
  .actions((a) => [a.action('download', { label: 'Download PDF' })])
