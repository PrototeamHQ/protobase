import type { Client } from '@protobase/client'
import type { PresenceStore } from '../presence/presence'
import type { RelayStore } from './relay-store'
import { isNewer, peopleChannel, presenceEvent, presenceFilter, presenceReport, type PresenceReport } from './relay-presence'

/** The presence resource and its fields, as `/meta` names them with the relay. */
export type PresenceFields = { resource: string; user: string; status: string; at: string }

/** The most people one read asks for, the page size it reads them in. */
const perRead = 100

/**
 * Keeps the relay's presence in the page's presence store until the returned function is called: the presence records
 * of the people the page shows, read once for those it did not read yet, in reads of up to 100 people, again for
 * everyone after the relay reconnects, and each `presence_changed` on `people` applied as it comes. A report that began
 * earlier than the one known, such as a read that answers late, changes nothing. A read that fails is reported, and its
 * people read again with the next reconnect.
 */
export const followPresence = (client: Client, fields: PresenceFields, presence: PresenceStore, relay: RelayStore) => {
  const known = new Map<string, PresenceReport>()
  const asked = new Set<string>()
  let current = true

  const apply = (reports: readonly PresenceReport[]) => {
    const news = reports.filter((report) => isNewer(known.get(report.user), report))
    if (news.length === 0) return
    for (const report of news) known.set(report.user, report)
    presence.heard(Object.fromEntries([...known].map(([user, report]) => [user, report.status])))
  }

  const read = (people: readonly string[]) => {
    for (const person of people) asked.add(person)
    for (let start = 0; start < people.length; start += perRead) {
      const some = people.slice(start, start + perRead)
      client.list(fields.resource, { filter: presenceFilter(fields.user, some), pageSize: some.length, fields: [fields.user, fields.status, fields.at] }).then(
        (page) => {
          if (current) apply(page.items.flatMap((item) => presenceReport(item, fields) ?? []))
        },
        (error: unknown) => {
          if (!current) return
          for (const person of some) asked.delete(person)
          reportError(error)
        },
      )
    }
  }

  // The people a page starts to show together, such as a list's rows, are read together once the page drew them.
  let pending = false
  const readNew = () => {
    if (pending) return
    pending = true
    queueMicrotask(() => {
      pending = false
      if (current) read(presence.shown().filter((person) => !asked.has(person)))
    })
  }

  readNew()
  const stops = [
    presence.onShown(readNew),
    // Changes went by unheard while the relay was down: everyone shown is read again, anyone else once shown again.
    relay.onResync(() => {
      asked.clear()
      read(presence.shown())
    }),
    relay.onPublished((published) => {
      if (published.channel !== peopleChannel || published.event !== presenceEvent) return
      const report = presenceReport(published.payload)
      if (report) apply([report])
    }),
  ]
  return () => {
    current = false
    for (const stop of stops) stop()
    presence.heard(undefined)
  }
}
