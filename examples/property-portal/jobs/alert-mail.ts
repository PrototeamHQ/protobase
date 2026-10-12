import { appPath, enumLabel } from '@protobase/schema'
import type { MailMessage } from '@protobase/server'
import { offerTypeLabels } from '../config/listings/labels'

/** One alert as the mail lists it. */
export type MailedAlert = { listing_id: string; address: string; place: string; offer_type: 'sale' | 'rent'; price: string; living_area: number; profile: string }

const euros = (amount: string) => `€${Math.round(Number(amount)).toLocaleString('en-GB')}`

// A line per listing: where it is, what it costs, its size, the profile it fits and the link to its page.
const line = (alert: MailedAlert, baseUrl: string) =>
  [
    `${alert.address}, ${alert.place}`,
    `  ${enumLabel(alert.offer_type, offerTypeLabels)}: ${euros(alert.price)}${alert.offer_type === 'rent' ? ' a month' : ''}, ${alert.living_area} m²`,
    `  Fits "${alert.profile}"`,
    `  ${baseUrl}${appPath({ kind: 'record', resource: 'listings', key: alert.listing_id })}`,
  ].join('\n')

/** The mail of a member's new alerts: one listing at once, or the day's in one digest. */
export const alertMail = (to: string, frequency: 'instant' | 'daily', alerts: MailedAlert[], baseUrl: string): MailMessage => {
  const count = alerts.length
  const subject = frequency === 'daily' ? `${count} new ${count === 1 ? 'home fits' : 'homes fit'} your searches` : count === 1 ? `New: ${alerts[0]!.address}, ${alerts[0]!.place}` : `${count} new homes fit your searches`
  const text = [
    frequency === 'daily' ? 'These homes were published since your last digest:' : 'A new home fits your search:',
    '',
    alerts.map((alert) => line(alert, baseUrl)).join('\n\n'),
    '',
    'Change what you hear about under Search profiles.',
  ].join('\n')
  return { to, subject, text }
}
