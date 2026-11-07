import type { SealedRevocation } from './sealed-revocation'

/** What the workflows do when an account of a connection is linked or disconnected, which accounts their triggers wait on, and the revocations they retry. */
export type ConnectionListener = {
  /** An account was linked again: the triggers waiting on its sign-in poll again. */
  linked: (accountId: string) => Promise<void>
  /** An account was disconnected: the triggers on it wait for a new sign-in. */
  disconnected: (accountId: string) => Promise<void>
  /** The accounts among `accountIds` that a trigger waits on to be signed in again. */
  needsSignIn: (accountIds: string[]) => Promise<string[]>
  /** The workflows among those `userId` turned on, and may still change, whose enabled version binds one of `accountIds`, by account. */
  uses: (userId: string, accountIds: string[]) => Promise<AccountUses>
  /** A disconnected account's token the provider did not revoke: queue it to be revoked again later. */
  revokeLater: (revocation: SealedRevocation) => Promise<void>
  /** A disconnected account's token that is not revoked and not queued, and why, for the app's error report; never the token. */
  unrevoked: (failure: Unrevoked) => void
}

/** Why a disconnected account's token was left unrevoked: it did not decrypt, the revocation or its queueing threw. */
export type Unrevoked = { provider: string; reason: 'unreadable' | 'revoke_failed' | 'queue_failed' }

/** The workflows that use each account, by its id. */
export type AccountUses = Record<string, { id: string; name: string }[]>

/**
 * The listener sign-in tells of connections, which the workflows set once they are made, after the auth instance;
 * until then, and in an app without workflows, nothing listens.
 */
export const connectionEvents = () => {
  let listener: ConnectionListener | undefined
  return {
    set: (next: ConnectionListener) => void (listener = next),
    linked: async (accountId: string) => listener?.linked(accountId),
    disconnected: async (accountId: string) => listener?.disconnected(accountId),
    needsSignIn: async (accountIds: string[]) => (listener && accountIds.length > 0 ? listener.needsSignIn(accountIds) : []),
    uses: async (userId: string, accountIds: string[]): Promise<AccountUses> => (listener && accountIds.length > 0 ? listener.uses(userId, accountIds) : {}),
    /** Whether a revocation can be queued: disconnecting refuses before it deletes anything when it cannot. */
    listening: () => listener !== undefined,
    revokeLater: async (revocation: SealedRevocation) => {
      if (!listener) throw new Error('No workflows listen to queue the revocation')
      await listener.revokeLater(revocation)
    },
    unrevoked: (failure: Unrevoked) => listener?.unrevoked(failure),
  }
}

export type ConnectionEvents = ReturnType<typeof connectionEvents>
