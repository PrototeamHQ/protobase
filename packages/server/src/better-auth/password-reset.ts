import type { BetterAuthOptions } from 'better-auth'
import { sendAuthEmail, type AuthMail } from './auth-mail/send-auth-email'

/** How long an emailed reset link works, in seconds and in the email's words. */
export const resetLinkLifetimeSeconds = 60 * 60
const resetLinkLifetime = '1 hour'

/**
 * Better Auth's own password reset, sending the link with `mail`. Resetting ends the user's sessions, so a reset
 * after a leaked password also signs out whoever used it.
 */
export const passwordResetOptions = (mail: AuthMail) =>
  ({
    resetPasswordTokenExpiresIn: resetLinkLifetimeSeconds,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: ({ user, url }) => sendAuthEmail(mail, 'resetPasswordEmail', user.email, { url, lifetime: resetLinkLifetime }, url),
  }) satisfies Partial<NonNullable<BetterAuthOptions['emailAndPassword']>>
