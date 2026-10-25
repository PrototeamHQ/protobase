import type { BetterAuthPlugin } from 'better-auth'
import { createAuthEndpoint, sessionMiddleware, setPassword } from 'better-auth/api'
import * as z from 'zod'

export const setPasswordPath = '/account/set-password'

/**
 * `POST /account/set-password { newPassword }`: gives the signed-in account its first password, such as one made by
 * signing up with emailed codes or a provider. It is Better Auth's server-only `setPassword`, with its length rules;
 * an account that has a password already answers `400 PASSWORD_ALREADY_SET` and changes it with `/change-password`.
 * Every session, the one asking included, and every MCP grant stays: nothing was known to anyone else before. The
 * sign-in policy refuses it while passwords are off, and the staff plugin refuses it for a staff session.
 */
export const setPasswordPlugin = () =>
  ({
    id: 'protobase-set-password',
    endpoints: {
      setFirstPassword: createAuthEndpoint(setPasswordPath, { method: 'POST', use: [sessionMiddleware], body: z.object({ newPassword: z.string() }) }, async (ctx) => {
        await setPassword({ ...ctx, body: { newPassword: ctx.body.newPassword } })
        return ctx.json({ status: true })
      }),
    },
  }) satisfies BetterAuthPlugin
