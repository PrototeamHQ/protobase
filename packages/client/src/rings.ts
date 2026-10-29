import { ringsPath, type CallRing } from '@protobase/schema/internal'
import type { Transport } from './transport'

export type { CallRing } from '@protobase/schema/internal'

/**
 * The calls that ring the signed-in user (`/api/calls/rings`), in an app with calls: `list` those ringing them now,
 * newest first, and `decline` stops one ringing them on every page they have open. Joining the call stops it too.
 */
export const ringsClient = (send: Transport) => ({
  list: async (): Promise<CallRing[]> => ((await (await send({ method: 'GET', path: ringsPath(''), system: true })).json()) as { items: CallRing[] }).items,
  decline: async (call: string) => {
    await send({ method: 'POST', path: ringsPath('', { decline: call }), system: true, body: {} })
  },
})

export type RingsClient = ReturnType<typeof ringsClient>
