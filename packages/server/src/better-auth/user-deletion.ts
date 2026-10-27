import type { BetterAuthPlugin } from 'better-auth'
import { createAuthMiddleware, getSessionFromCtx, isAPIError } from 'better-auth/api'
import { superuserRole } from './organizations/role-definitions'
import { parseRoles } from './parse-roles'

/** Removes what the app keeps of a user elsewhere than the auth store, such as their devices; it throws to stop the deletion. */
export type UserDeletionListener = (userId: string) => Promise<void>

const removePath = '/admin/remove-user'

/**
 * What runs when a user is deleted, by an admin (`/admin/remove-user`), by `deleteUser` (the CLI) or by themselves
 * (`/delete-user`, see `selfDeletionOptions`): each listener before anything is deleted, so one that throws stops the
 * deletion with the user, their sessions and accounts in place, and once more after the user is gone, for what was
 * added in between.
 */
export const userDeletion = () => {
  const listeners = new Map<string, UserDeletionListener>()
  const run = async (userId: string) => {
    for (const listener of listeners.values()) await listener(userId)
  }
  // The checks of the admin plugin's endpoint, which runs after this: only an admin removes someone else who exists.
  type HookContext = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0]
  const allowedRemoval = async (ctx: HookContext) => {
    const userId = (ctx.body as { userId?: unknown } | undefined)?.userId
    if (typeof userId !== 'string' || userId === '') return undefined
    const session = await getSessionFromCtx(ctx)
    if (!session || !parseRoles((session.user as { role?: string | null }).role).includes(superuserRole) || session.user.id === userId) return undefined
    return (await ctx.context.internalAdapter.findUserById(userId)) ? userId : undefined
  }
  const plugin = {
    id: 'protobase-user-deletion',
    hooks: {
      before: [
        {
          matcher: (context) => context.path === removePath,
          handler: createAuthMiddleware(async (ctx) => {
            const userId = await allowedRemoval(ctx)
            if (userId !== undefined) await run(userId)
          }),
        },
      ],
      after: [
        {
          matcher: (context) => context.path === removePath,
          handler: createAuthMiddleware(async (ctx) => {
            const userId = (ctx.body as { userId?: unknown } | undefined)?.userId
            if (isAPIError(ctx.context.returned) || typeof userId !== 'string' || userId === '') return
            await run(userId)
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin
  return {
    plugin,
    run,
    /** Sets the listener of `name`, in place of the one it had: an app built again does not add another. */
    set: (name: string, listener: UserDeletionListener) => void listeners.set(name, listener),
  }
}

export type UserDeletion = ReturnType<typeof userDeletion>
