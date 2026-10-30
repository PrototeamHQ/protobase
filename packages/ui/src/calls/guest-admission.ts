import type { guestLobby } from '@protobase/client/calls'

/** Why a guest is not let into the call: turned away, the link or call is over, or the lobby cannot be reached now. */
export class NotLetIn extends Error {
  constructor(readonly reason: 'denied' | 'ended' | 'refused' | 'unavailable') {
    super(`Not let into the call: ${reason}`)
    this.name = 'NotLetIn'
  }
}

/** How often a waiting guest asks after their wait. */
export const waitEveryMs = 1000

const later = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => (clearTimeout(timer), resolve()), { once: true })
  })

/**
 * A guest's way into the call: they wait in the lobby of the link, by their name, asking once a second, until a member
 * lets them in, with the guest's token for `joinCall`, or turns them away, or the link or call is over. Aborting leaves
 * the lobby.
 */
export const guestAdmission = async (lobby: ReturnType<typeof guestLobby>, link: string, name: string, signal: AbortSignal) => {
  const { LobbyRefused } = await import('@protobase/client/calls')
  const refusal = (error: unknown) => {
    if (!(error instanceof LobbyRefused)) return error
    return new NotLetIn(error.status === 404 ? 'refused' : error.status === 429 ? 'unavailable' : 'ended')
  }
  const { token } = await lobby.enter(link, name).catch((error: unknown) => Promise.reject(refusal(error)))
  while (!signal.aborted) {
    const wait = await lobby.wait(token).catch((error: unknown) => Promise.reject(refusal(error)))
    if (wait.state === 'admitted') return token
    if (wait.state === 'denied') throw new NotLetIn('denied')
    if (wait.state === 'ended') throw new NotLetIn('ended')
    await later(waitEveryMs, signal)
  }
  await lobby.leave(token)
  throw new NotLetIn('ended')
}
