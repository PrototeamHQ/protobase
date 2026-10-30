import type { CallClientMessage, CallGuestLink, CallGuestRefusal, CallServerMessage, CallTrackSource } from '@protobase/schema/internal'

/** A guest request the server did not do, with why: see `CallGuestRefusal`. */
export class GuestRefused extends Error {
  constructor(readonly reason: CallGuestRefusal) {
    super(`The guest request was refused: ${reason}`)
    this.name = 'GuestRefused'
  }
}

/** What a member who invites does with the call's guests. Each rejects with `GuestRefused` when the server did not. */
export type CallGuests = {
  /** A new link to the call that lets a guest send these sources, until `expiresAt` or the call's end; its token once. */
  link: (options: { publish: CallTrackSource[]; expiresAt?: Date }) => Promise<{ link: CallGuestLink; token: string }>
  /** Revokes a link: its guests are out of the call, and nobody else waits on it. */
  revoke: (link: string) => Promise<void>
  admit: (guest: string) => Promise<void>
  deny: (guest: string) => Promise<void>
  /** Takes a guest out of the call, for good. */
  remove: (guest: string) => Promise<void>
}

type Pending = { resolve: (value: never) => void; reject: (error: unknown) => void }

/**
 * The member's guest requests over the call's socket: the server answers each once, in order, so the answers are paired
 * with the requests in the order they were sent. A request whose socket closed before its answer rejects.
 */
export const guestRequests = (send: (message: CallClientMessage) => void) => {
  const pending: Pending[] = []
  const ask = <T>(message: CallClientMessage) =>
    new Promise<T>((resolve, reject) => {
      pending.push({ resolve: resolve as (value: never) => void, reject })
      send(message)
    })
  const guests: CallGuests = {
    link: ({ publish, expiresAt }) => ask({ type: 'guest-link', publish, ...(expiresAt && { expires_at: expiresAt.toISOString() }) }),
    revoke: (link) => ask({ type: 'guest-link-revoke', link }),
    admit: (guest) => ask({ type: 'guest-decide', guest, admit: true }),
    deny: (guest) => ask({ type: 'guest-decide', guest, admit: false }),
    remove: (guest) => ask({ type: 'guest-remove', guest }),
  }
  return {
    guests,
    /** Whether the message answered a request, which it then settles. */
    receive: (message: CallServerMessage) => {
      if (message.type !== 'guest-link' && message.type !== 'guest-done' && message.type !== 'guest-refused') return false
      const request = pending.shift()
      if (message.type === 'guest-refused') request?.reject(new GuestRefused(message.reason))
      else request?.resolve((message.type === 'guest-link' ? { link: message.link, token: message.token } : undefined) as never)
      return true
    },
    /** The socket closed: the requests on it are not answered. */
    lost: () => {
      for (const request of pending.splice(0)) request.reject(new Error('The link to the call was lost before the server answered'))
    },
  }
}
