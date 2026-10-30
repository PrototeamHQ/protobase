import { guestCallsPath } from '@protobase/schema/internal'
import type { Transport } from './transport'

/**
 * Whether the calls of the organization the signed-in user works in take guests (`/api/calls/guests/organization`):
 * `allowed` for any member, `setAllowed` for its owner or an admin. Turning them off revokes every guest link of its
 * calls and takes their guests out at once.
 */
export const callGuestsClient = (send: Transport) => ({
  allowed: async () => ((await (await send({ method: 'GET', path: guestCallsPath('', 'organization'), system: true })).json()) as { allowed: boolean }).allowed,
  setAllowed: async (allowed: boolean) => {
    await send({ method: 'PUT', path: guestCallsPath('', 'organization'), system: true, body: { allowed } })
  },
})

export type CallGuestsClient = ReturnType<typeof callGuestsClient>
