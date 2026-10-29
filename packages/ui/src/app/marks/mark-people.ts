import type { PersonStatus } from '@protobase/client'
import type { RecordMark, ShownMark } from '../../app-shell/nav'
import { presenceOf, type PresenceByUser } from '../../presence/presence'

/**
 * The marks as the sidebar draws them: each mark that names a `person` carries that person's presence and status, by
 * their user id, each left out when the app gives none for them.
 */
export const markPeople = (marks: Record<string, RecordMark> | undefined, presence: PresenceByUser | undefined, statuses: readonly PersonStatus[] | undefined): Record<string, ShownMark> | undefined => {
  if (!marks) return
  const statusOf = new Map((statuses ?? []).map((status) => [status.userId, status]))
  return Object.fromEntries(
    Object.entries(marks).map(([key, { person, ...mark }]) => {
      if (person === undefined) return [key, mark]
      const status = statusOf.get(person)
      const shown = presenceOf(presence, person)
      return [key, { ...mark, person: { ...(status && { status }), ...(shown && { presence: shown }) } }]
    }),
  )
}
