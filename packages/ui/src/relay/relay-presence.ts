import type { Presence } from '../presence/presence'
import { literal } from './unread'

/** The channel every signed-in person's relay ticket lists, which presence is published on. */
export const peopleChannel = 'people'

/** The event a person's new presence is published as on `people`. */
export const presenceEvent = 'presence_changed'

/** A person's presence as the relay reported it: since when, as the presence resource holds it. */
export type PresenceReport = { user: string; status: Presence; at: string }

const statuses = new Set<unknown>(['online', 'away', 'offline'])

/**
 * A report from a `presence_changed` payload or a presence record, undefined for anything else. A whole-number user, as
 * a record of a resource keyed by an integer holds it, becomes its text, as the payload names it.
 */
export const presenceReport = (value: Record<string, unknown>, fields = { user: 'user', status: 'status', at: 'at' }): PresenceReport | undefined => {
  const raw = value[fields.user]
  const user = typeof raw === 'number' && Number.isInteger(raw) ? String(raw) : raw
  const status = value[fields.status]
  const at = value[fields.at]
  if (typeof user !== 'string' || !statuses.has(status) || typeof at !== 'string') return
  return { user, status: status as Presence, at }
}

/** Whether a report is news against the one known for the person: none known, or one that began no later. */
export const isNewer = (known: PresenceReport | undefined, report: PresenceReport) => !known || Date.parse(report.at) >= Date.parse(known.at)

/** The filter of the presence records of `people`, by the resource's user field: a whole number bare, anything else quoted. */
export const presenceFilter = (user: string, people: readonly string[]) => `in(${user}, ${people.map(literal).join(', ')})`
