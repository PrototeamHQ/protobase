import { appPath } from '@protobase/schema'
import type { MailMessage } from '@protobase/server'

/** One alert as the mail lists it: a price empty when the listing is not offered that way. */
export type MailedAlert = { listing_id: string; address: string; place: string; purchase_price: string | null; rent_price: string | null; living_area: number; profile: string }

const euros = (amount: string) => `€${Math.round(Number(amount)).toLocaleString('en-GB')}`

// What it costs each way it is offered: "For sale: €650,000 or for rent: €2,100 a month".
const prices = (alert: MailedAlert) => {
  const offers = [
    ...(alert.purchase_price === null ? [] : [`for sale: ${euros(alert.purchase_price)}`]),
    ...(alert.rent_price === null ? [] : [`for rent: ${euros(alert.rent_price)} a month`]),
  ].join(' or ')
  return offers.charAt(0).toUpperCase() + offers.slice(1)
}

// A line per listing: where it is, what it costs, its size, the profile it fits and the link to its page.
const line = (alert: MailedAlert, baseUrl: string) =>
  [
    `${alert.address}, ${alert.place}`,
    `  ${prices(alert)}, ${alert.living_area} m²`,
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
