import type { AuthContext, BetterAuthPlugin } from 'better-auth'
import { APIError, createAuthEndpoint, sessionMiddleware } from 'better-auth/api'
import * as z from 'zod'
import { sendAuthEmail, type AuthMail } from './auth-mail/send-auth-email'
import { checkConfirmationCode, dropConfirmationCode, newConfirmationCode, saveConfirmationCode, type CodeCheck } from './confirmation-codes'
import { codeLifetime } from './sign-in-mail'
import { saveStrongSignIn } from './strong-sign-ins'

/** The endpoints of the emailed confirmation code, as Better Auth's `ctx.path` names them. */
export const confirmationCodePaths = { send: '/account/confirmation-code/send', verify: '/account/confirmation-code/verify' }

const notOffered = { code: 'CONFIRMATION_CODE_NOT_OFFERED', message: "Confirm it's you with your passkey or your second step instead." }

const refusals: Record<Exclude<CodeCheck, 'confirmed'>, { status: 'BAD_REQUEST' | 'FORBIDDEN'; code: string; message: string }> = {
  wrong: { status: 'BAD_REQUEST', code: 'INVALID_CODE', message: 'The code is not right.' },
  'too-many': { status: 'FORBIDDEN', code: 'TOO_MANY_ATTEMPTS', message: 'Too many wrong codes. Ask for a new one.' },
  expired: { status: 'BAD_REQUEST', code: 'OTP_EXPIRED', message: 'The code has expired. Ask for a new one.' },
}

type Signed = { session: { id: string; expiresAt: Date }; user: { id: string; email: string; twoFactorEnabled?: boolean | null } }

// Only an account with neither a passkey nor a second step confirms with an emailed code; the others keep the stronger one.
const isOffered = async (context: AuthContext, { user }: Signed) =>
  !user.twoFactorEnabled && (await context.adapter.count({ model: 'passkey', where: [{ field: 'userId', value: user.id }] })) === 0

/**
 * An emailed code that confirms it's them inside a session someone is signed in with, for an account without a passkey
 * or a second step, which has nothing stronger to confirm with: a right code notes a strong sign-in for that session
 * (`saveStrongSignIn`), as a passkey or a second step does. The code is its own kind, never a sign-in code; it belongs
 * to the session and user that asked for it, a new one ends the one before, and it stops working after a few wrong
 * ones (`confirmationCodeTries`). When the email cannot be sent, the request fails and no code is kept. The endpoints
 * read the session cookie only, so an MCP client or an app's token cannot ask for one; staff sessions are refused by
 * the staff plugin.
 */
export const confirmationCodePlugin = (mail: AuthMail) =>
  ({
    id: 'protobase-confirmation-code',
    endpoints: {
      /** `POST /account/confirmation-code/send`: emails the signed-in person a new confirmation code. */
      sendConfirmationCode: createAuthEndpoint(confirmationCodePaths.send, { method: 'POST', use: [sessionMiddleware] }, async (ctx) => {
        const signed = ctx.context.session as Signed
        if (!(await isOffered(ctx.context, signed))) throw new APIError('FORBIDDEN', notOffered)
        const holder = { userId: signed.user.id, sessionId: signed.session.id }
        await dropConfirmationCode(ctx.context.internalAdapter, holder.sessionId)
        const code = newConfirmationCode()
        await sendAuthEmail(mail, 'confirmationCodeEmail', signed.user.email, { code, lifetime: codeLifetime }, ctx.context.baseURL)
        await saveConfirmationCode(ctx.context.internalAdapter, holder, code)
        return ctx.json({ status: true })
      }),

      /** `POST /account/confirmation-code/verify` with `{ code }`: confirms the session with the code it was emailed. */
      verifyConfirmationCode: createAuthEndpoint(confirmationCodePaths.verify, { method: 'POST', use: [sessionMiddleware], body: z.object({ code: z.string() }) }, async (ctx) => {
        const signed = ctx.context.session as Signed
        if (!(await isOffered(ctx.context, signed))) throw new APIError('FORBIDDEN', notOffered)
        const checked = await checkConfirmationCode(ctx.context.internalAdapter, { userId: signed.user.id, sessionId: signed.session.id }, ctx.body.code.trim())
        if (checked !== 'confirmed') {
          const { status, ...refusal } = refusals[checked]
          throw new APIError(status, refusal)
        }
        await saveStrongSignIn(ctx.context.internalAdapter, signed.session)
        return ctx.json({ status: true })
      }),
    },
  }) satisfies BetterAuthPlugin
