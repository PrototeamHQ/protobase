import { f, resource } from '@protobase/schema'
import { erpAccess } from '../roles'

/** core.notification_settings: each person's own, shown by the account page's Notifications tab. */
export const notificationSettings = resource('notification_settings')
  .table('core.notification_settings')
  .fields({
    user_id: f.text(),
    overdue_invoices: f.enum(['each', 'daily', 'never']).default('each'),
  })
  .primaryKey((r) => r.user_id)
  .owner((r) => r.user_id)
  .access(erpAccess('notification_settings'))
