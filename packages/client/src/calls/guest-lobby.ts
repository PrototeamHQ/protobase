import { guestCallsPath, type CallGuestState, type CallTrackSource } from '@protobase/schema/internal'

/** A guest's wait in the lobby, as the server tells it: once let in, the call and what the guest may send. */
export type GuestWait = { state: CallGuestState; call?: string; publish?: CallTrackSource[] }

/** Why the lobby did not answer: no live link, too many tries for now, or a name it does not take. */
export class LobbyRefused extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'LobbyRefused'
  }
}

export type GuestLobbyOptions = {
  /** The API's system path on the page's origin, `/api` by default. */
  systemPath?: string
  fetch?: typeof fetch
}

/**
 * The lobby a guest of a call waits in, with no account: `enter` with the link's token and the guest's name gives the
 * guest's own token, which `wait` and `leave` send, and which `joinCall` takes as `guest` at `socketUrl` once a member
 * let them in. No cookie is sent or kept.
 */
export const guestLobby = ({ systemPath = '/api', fetch: fetchOf = globalThis.fetch }: GuestLobbyOptions = {}) => {
  const lobby = guestCallsPath(systemPath, 'lobby')
  const ask = async (init: RequestInit) => {
    const response = await fetchOf(lobby, { ...init, credentials: 'omit', cache: 'no-store' })
    if (!response.ok) throw new LobbyRefused(response.status, ((await response.json().catch(() => undefined)) as { detail?: string } | undefined)?.detail ?? response.statusText)
    return response
  }
  const bearer = (token: string) => ({ authorization: `Bearer ${token}` })
  return {
    /** The guest's call socket, for `joinCall`'s `url`. */
    socketUrl: guestCallsPath(systemPath, 'socket'),
    enter: async (link: string, name: string) => (await (await ask({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ link, name }) })).json()) as { guest: string; token: string },
    wait: async (token: string) => (await (await ask({ method: 'GET', headers: bearer(token) })).json()) as GuestWait,
    leave: async (token: string) => {
      await ask({ method: 'DELETE', headers: bearer(token) })
    },
  }
}
