import { leavesNoAdmin } from './last-admin'
import { refuseLastAdmin } from './last-admin-guard'
import { refuseLockedAccount } from './locked-accounts'
import { revokeMcpGrants } from './mcp/revoke-grants'
import type { AuthContext } from './organizations/store'
import type { UserDeletion } from './user-deletion'

/** The paths of Better Auth's own deletion of the signed-in person's account, and of its emailed confirmation, which Protobase does not send. */
export const selfDeletionPath = '/delete-user'
export const selfDeletionCallbackPath = '/delete-user/callback'

type SelfDeletionInput = {
  /** The addresses of the locked accounts (`PROTOBASE_LOCKED_ACCOUNTS`), in lower case. */
  lockedAccounts: string[]
  /** What runs when a user is deleted (`userDeletion`). */
  deletion?: UserDeletion
  /** The app has MCP, whose grants the user leaves behind. */
  mcp: boolean
  /** The auth instance's context, once the instance exists. */
  context: () => Promise<AuthContext>
}

/**
 * Better Auth's `user.deleteUser`: the signed-in person deletes their own account, with their password or from a
 * session that signed in within the last day. Once Better Auth has checked that, a locked account and the last active
 * admin are refused, the `userDeletion` listeners and the MCP grants go, and Better Auth deletes the user with their
 * sessions and accounts; the listeners run once more after.
 */
export const selfDeletionOptions = ({ lockedAccounts, deletion, mcp, context }: SelfDeletionInput) => ({
  enabled: true,
  beforeDelete: async (user: { id: string; email: string }) => {
    if (lockedAccounts.includes(user.email.toLowerCase())) refuseLockedAccount()
    const store = await context()
    if (await leavesNoAdmin(store, { userId: user.id, removed: true })) refuseLastAdmin()
    await deletion?.run(user.id)
    if (mcp) await revokeMcpGrants(store.adapter, user.id)
  },
  afterDelete: async (user: { id: string }) => {
    await deletion?.run(user.id)
  },
})
