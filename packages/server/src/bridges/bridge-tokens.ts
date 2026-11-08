import { randomBytes } from 'node:crypto'
import type { Session } from '../types'

/** How long a bridge token opens its bridge after it is issued: long enough for a client to open the socket at once. */
export const openWithinMs = 30_000

/** The bridge a token opens, for whom, and when that bridge closes. */
export type BridgeGrant = { caller: Session; target: string; host: string; port: number; expiresAt: number }

type Issued = BridgeGrant & { openBy: number }

export type BridgeTokensInput = {
  now?: () => number
  /** How many tokens may wait to be used at once; past it, issuing one fails rather than drop another's. */
  capacity?: number
  /** How many tokens one user may have waiting; past it, their oldest is dropped, so no one user fills the store. */
  perUser?: number
}

/**
 * The tokens a bridge issued and that are not used yet, in this process: `issue` mints a random token for a grant,
 * which `take` gives back once, before its `openBy`, and never again. An expired token is dropped as the next one is
 * issued, so the store holds at most `capacity` tokens of the last `openWithinMs`, and at most `perUser` of one user.
 */
export const bridgeTokens = ({ now = Date.now, capacity = 10_000, perUser = 20 }: BridgeTokensInput = {}) => {
  const issued = new Map<string, Issued>()

  const dropExpired = () => {
    const at = now()
    for (const [token, { openBy }] of issued) if (openBy <= at) issued.delete(token)
  }

  const dropOldestOf = (user: BridgeGrant['caller']['user']['id']) => {
    const theirs = [...issued].filter(([, entry]) => entry.caller.user.id === user)
    if (theirs.length >= perUser) issued.delete(theirs[0]![0])
  }

  const issue = (grant: BridgeGrant) => {
    dropExpired()
    dropOldestOf(grant.caller.user.id)
    if (issued.size >= capacity) throw new Error('Too many bridge tokens are waiting to be used')
    const token = randomBytes(32).toString('base64url')
    const openBy = now() + openWithinMs
    issued.set(token, { ...grant, openBy })
    return { token, openBy }
  }

  const take = (token: string): BridgeGrant | undefined => {
    const entry = issued.get(token)
    if (!entry) return
    issued.delete(token)
    if (entry.openBy <= now()) return
    const { openBy: _openBy, ...grant } = entry
    return grant
  }

  return { issue, take }
}

export type BridgeTokens = ReturnType<typeof bridgeTokens>
