import type { BetterAuthOptions } from 'better-auth'
import { headersLocale } from '../locale/request-locale'
import { sendAuthEmail, type AuthMail } from './auth-mail/send-auth-email'

/** How long an emailed reset link works, in seconds and in hours for the email. */
export const resetLinkLifetimeSeconds = 60 * 60
const resetLinkHours = resetLinkLifetimeSeconds / 3600

type EmailAndPassword = NonNullable<BetterAuthOptions['emailAndPassword']>

/**
 * Better Auth's own password reset, sending the link with `mail`. Resetting ends the user's sessions, so a reset
 * after a leaked password also signs out whoever used it, and `onPasswordReset` disconnects the user's MCP clients
 * and tells them their password changed.
 */
export const passwordResetOptions = (mail: AuthMail, { onPasswordReset }: Pick<EmailAndPassword, 'onPasswordReset'> = {}) =>
  ({
    resetPasswordTokenExpiresIn: resetLinkLifetimeSeconds,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: ({ user, url }, request) => sendAuthEmail(mail, 'resetPasswordEmail', user.email, { url, hours: resetLinkHours }, url, headersLocale(request?.headers)),
    ...(onPasswordReset && { onPasswordReset }),
  }) satisfies Partial<EmailAndPassword>
