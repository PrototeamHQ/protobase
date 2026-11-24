import { getCurrentAdapter } from '@better-auth/core/context'
import type { PinRead } from './kept-organizations'
import { isPinnedMember, joinPinned, notPinnedMember } from './pinned-membership'
import type { AuthContext } from './store'

// Sign-in while organizations are off after being on: only members of the pinned organization get a session, and
// someone who joins then becomes one.

type HookContext = object | null | undefined

/**
 * The user and session hooks that keep sign-in to the pinned organization, while `pin` reads one. Every way of signing
 * in ends in a session, which is refused to a user who is no member of it. A new user joins it once their row is
 * committed; sign-up may make their session in the same transaction, before that, so a user the same request created
 * gets it.
 */
export const pinnedSessionHooks = (pin: PinRead, context: () => Promise<AuthContext>) => {
  // The addresses each request created users for; a request's entry goes with it.
  const created = new WeakMap<object, Set<string>>()
  const createdHere = (request: HookContext, email: string) => (request ? (created.get(request)?.has(email) ?? false) : false)
  return {
    user: {
      before: async (user: { email: string }, request: HookContext) => {
        if (!request) return
        const emails = created.get(request) ?? new Set<string>()
        emails.add(user.email.toLowerCase())
        created.set(request, emails)
      },
      after: async (user: { id: string }) => {
        const pinned = await pin()
        if (!pinned) return
        const { adapter } = await context()
        await joinPinned(adapter, pinned, user.id)
      },
    },
    session: async (session: { userId: string }, request: HookContext) => {
      const pinned = await pin()
      if (!pinned) return
      const { adapter, internalAdapter } = await context()
      const current = await getCurrentAdapter(adapter)
      if (await isPinnedMember(current as AuthContext['adapter'], pinned, session.userId)) return
      const user = await internalAdapter.findUserById(session.userId)
      if (user && createdHere(request, user.email.toLowerCase())) return
      throw notPinnedMember()
    },
  }
}
