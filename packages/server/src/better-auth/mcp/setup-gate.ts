import type { BetterAuthPlugin } from 'better-auth'
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api'
import { addressNotVerified, setupRequired } from '../sign-in-enforcement'
import type { SignInPolicy } from '../sign-in-policy'
import { missingSetup } from '../sign-in-setup'
import { isStaffSession } from '../staff-checks'

const gatedPaths = ['/oauth2/authorize', '/oauth2/continue', '/oauth2/consent']

export type SetupGateOptions = {
  /** Mail can be sent, as the sign-in policy reads it. */
  mail: boolean
  /** The policy until an admin saves one, from `appSignInPolicy`. */
  defaultPolicy: SignInPolicy
  /** The connect page, where a person who has to set something up first is shown what. */
  connectPage: string
}

/**
 * Holds back allowing an MCP client from someone who has not set up what the sign-in policy requires: `authorize`
 * sends them to the connect page, which shows the setup page; `continue` and `consent` answer `403
 * SIGN_IN_SETUP_REQUIRED`. Someone whose address is not verified cannot allow a client either (`403
 * ADDRESS_NOT_VERIFIED`); `authorize` lets them reach the connect page, which says so. Staff sessions are refused by
 * the staff plugin, before this.
 */
export const mcpSetupGate = ({ mail, defaultPolicy, connectPage }: SetupGateOptions) =>
  ({
    id: 'protobase-mcp-setup-gate',
    hooks: {
      before: [
        {
          matcher: (context) => context.path !== undefined && gatedPaths.includes(context.path),
          handler: createAuthMiddleware(async (ctx) => {
            const session = await getSessionFromCtx(ctx)
            if (!session || isStaffSession(session.session)) return
            const authorize = ctx.path === '/oauth2/authorize'
            if ((await missingSetup(ctx.context, session.user, { mail, defaultPolicy })).length > 0) {
              if (authorize) throw ctx.redirect(connectPage)
              throw new APIError('FORBIDDEN', setupRequired)
            }
            if (session.user.emailVerified !== true && !authorize) throw new APIError('FORBIDDEN', addressNotVerified)
          }),
        },
      ],
    },
  }) satisfies BetterAuthPlugin
