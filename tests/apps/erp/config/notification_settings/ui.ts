import { view } from '@protobase/schema'
import type { notificationSettings } from './data'

export const notificationSettingsView = view<typeof notificationSettings>('notification_settings')
  .names({ singular: 'Notification setting', plural: 'Notification settings' })
  // Each person changes their own on the account page.
  .nav({ hidden: true })
  .fields((r) => ({
    overdue_invoices: r.overdue_invoices
      .label('Overdue invoices')
      .help('An email when an invoice passes its due date unpaid.')
      .valueLabels({ each: 'For each invoice', daily: 'Once a day', never: 'Never' }),
  }))
