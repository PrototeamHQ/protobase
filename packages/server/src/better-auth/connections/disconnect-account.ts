import type { ConnectionEvents, Unrevoked } from './connection-events'
import type { ResolvedConnection } from './declared-connections'
import { revokeToken } from './revoke-token'
import { readable, sealToken, type SecretKey } from './sealed-revocation'

/** What disconnecting did with the account's token: the provider revoked it, it is queued to be tried again, or neither. */
export type Revocation = 'revoked' | 'queued' | 'not_revoked'

/** A stored account, as Better Auth keeps it: its tokens encrypted when the app encrypts them. */
type StoredAccount = { id: string; providerId: string; refreshToken?: string | null; accessToken?: string | null }

export type DisconnectInput = {
  account: StoredAccount
  connection: ResolvedConnection
  events: ConnectionEvents
  deleteAccount: (accountId: string) => Promise<void>
  /** The stored token as the provider issued it; throws when it does not decrypt. */
  decrypt: (stored: string) => Promise<string> | string
  secret: SecretKey
  allowPrivateAddresses: boolean
}

// An `Error` it threw, as undefined; anything else is no failure of the work and goes on.
const unlessFailed = <T>(work: Promise<T>) =>
  work.catch((error: unknown) => {
    if (error instanceof Error) return
    throw error
  })

/**
 * Revokes the token of an account being disconnected at its provider, and queues one the provider did not take to be
 * revoked again later, encrypted with the app's secret. A token that does not decrypt, a revocation that throws or a
 * queue that fails leaves it unrevoked, which the app's error report hears of, by reason only: the account is deleted
 * all the same.
 */
const revoke = async ({ account, connection, events, decrypt, secret, allowPrivateAddresses }: DisconnectInput): Promise<Revocation> => {
  const url = connection.revocationUrl
  const stored = account.refreshToken ?? account.accessToken
  if (!url || !stored) return 'not_revoked'
  const unrevoked = (reason: Unrevoked['reason']) => {
    events.unrevoked({ provider: account.providerId, reason })
    return 'not_revoked' as const
  }
  const token = await readable(async () => decrypt(stored))
  if (token === undefined) return unrevoked('unreadable')
  const hint = account.refreshToken ? 'refresh_token' : 'access_token'
  const revoked = await unlessFailed(revokeToken({ url, client: connection.client, token, hint, allowPrivateAddresses }))
  if (revoked) return 'revoked'
  if (revoked === undefined) events.unrevoked({ provider: account.providerId, reason: 'revoke_failed' })
  const queued = await unlessFailed(sealToken(secret, token).then((sealed) => events.revokeLater({ provider: account.providerId, hint, token: sealed })).then(() => true))
  return queued ? 'queued' : unrevoked('queue_failed')
}

/**
 * Disconnects an account: its triggers wait for a new sign-in, its token is revoked as `revoke` can, and the account is
 * deleted, so no step or trigger gets its token again. The triggers are parked first and the account deleted last:
 * when either fails, that error is the answer and the account stays, so disconnecting it again finishes the job;
 * parking triggers already parked changes nothing.
 */
export const disconnectAccount = async (input: DisconnectInput) => {
  await input.events.disconnected(input.account.id)
  const revocation = await revoke(input)
  await input.deleteAccount(input.account.id)
  return revocation
}
