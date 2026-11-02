import type { BetterAuthPlugin } from 'better-auth'
import { APIError, createAuthEndpoint, sessionMiddleware } from 'better-auth/api'
import * as z from 'zod'
import { confirmationMinutes } from '@protobase/schema/internal'
import type { AuthContext } from './organizations/store'
import { hasPasskeyOrSecondStep } from './strong-factors'

/** The endpoint that confirms it's them with the account's password, as Better Auth's `ctx.path` names it. */
export const passwordConfirmationPath = '/account/confirm-password'

type Internal = Pick<AuthContext['internalAdapter'], 'createVerificationValue' | 'deleteVerificationByIdentifier' | 'findVerificationValue'>

// Kept in Better Auth's verification table under a name of its own, apart from the strong sign-ins a reveal reads.
const identifierOf = (sessionId: string) => `protobase-password-confirmation-${sessionId}`

/** Notes that the session re-entered the account's password now; the note lasts `confirmationMinutes`. */
export const savePasswordConfirmation = async (internal: Internal, sessionId: string, now = new Date()) => {
  const identifier = identifierOf(sessionId)
  await internal.deleteVerificationByIdentifier(identifier)
  await internal.createVerificationValue({ identifier, value: now.toISOString(), expiresAt: new Date(now.getTime() + confirmationMinutes * 60_000) })
}

/** Whether the session re-entered the account's password within `confirmationMinutes`. */
export const isPasswordConfirmed = async (internal: Internal, sessionId: string, now = new Date()) => {
  const found = await internal.findVerificationValue(identifierOf(sessionId))
  return Boolean(found) && new Date(found!.expiresAt) > now
}

const notOffered = { code: 'PASSWORD_CONFIRMATION_NOT_OFFERED', message: "Confirm it's you with your passkey or your second step instead." }
const wrongPassword = { code: 'INVALID_PASSWORD', message: 'The password is not right.' }

type Signed = { session: { id: string }; user: { id: string; twoFactorEnabled?: boolean | null } }

/**
 * `POST /account/confirm-password` with `{ password }`: an account with a password and neither a passkey nor a second
 * step confirms it's them with it, for adding its first passkey (`recentConfirmationPlugin`). Unlike an emailed code,
 * it is no strong sign-in: a reveal still asks for one. Each try counts toward the password checks of the account
 * (`passwordChecksPlugin`); staff sessions are refused by the staff plugin.
 */
export const passwordConfirmationPlugin = () =>
  ({
    id: 'protobase-password-confirmation',
    endpoints: {
      confirmPassword: createAuthEndpoint(passwordConfirmationPath, { method: 'POST', use: [sessionMiddleware], body: z.object({ password: z.string() }) }, async (ctx) => {
        const signed = ctx.context.session as Signed
        if (await hasPasskeyOrSecondStep(ctx.context.adapter, signed.user)) throw new APIError('FORBIDDEN', notOffered)
        const hash = (await ctx.context.internalAdapter.findCredentialAccount(signed.user.id))?.password
        if (!hash) throw new APIError('FORBIDDEN', notOffered)
        if (ctx.body.password.length > ctx.context.password.config.maxPasswordLength) throw new APIError('BAD_REQUEST', wrongPassword)
        if (!(await ctx.context.password.verify({ hash, password: ctx.body.password }))) throw new APIError('BAD_REQUEST', wrongPassword)
        await savePasswordConfirmation(ctx.context.internalAdapter, signed.session.id)
        return ctx.json({ status: true })
      }),
    },
  }) satisfies BetterAuthPlugin
