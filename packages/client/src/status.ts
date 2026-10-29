import { statusPath, type PersonStatus, type StatusInput } from '@protobase/schema/internal'
import type { Transport } from './transport'

export type { Availability, PersonStatus, StatusInput } from '@protobase/schema/internal'

/**
 * People's own status (`/api/status`), in an app with `status: {}`: `own` the signed-in person's, `set` replaces it
 * and answers it, `clear` removes it, and `people` the statuses of everyone who shares an organization with them, those
 * without one left out. A status past its clear time is none. `set` rejects with an `ApiError` of slug
 * `invalid-status-text` for a text with control characters or over `maxStatusText` characters, and
 * `own-sign-in-only` for staff signed in as the person.
 */
export const statusClient = (send: Transport) => ({
  own: async (): Promise<PersonStatus | null> => ((await (await send({ method: 'GET', path: statusPath(''), system: true })).json()) as { status: PersonStatus | null }).status,
  set: async (status: StatusInput): Promise<PersonStatus | null> => ((await (await send({ method: 'PUT', path: statusPath(''), system: true, body: status })).json()) as { status: PersonStatus | null }).status,
  clear: async () => {
    await send({ method: 'DELETE', path: statusPath(''), system: true })
  },
  people: async (): Promise<PersonStatus[]> => ((await (await send({ method: 'GET', path: statusPath('', 'people'), system: true })).json()) as { statuses: PersonStatus[] }).statuses,
})

export type StatusClient = ReturnType<typeof statusClient>
