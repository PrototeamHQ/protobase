import type { BetterAuthOptions } from 'better-auth'
import type { Mailer } from '../mail/smtp-mailer'

/** How long an emailed reset link works, in seconds and in the email's words. */
export const resetLinkLifetimeSeconds = 60 * 60
const resetLinkLifetime = '1 hour'

/** The reset email: the link, how long it works, and that it can be ignored. */
export const resetEmail = ({ to, url }: { to: string; url: string }) => ({
  to,
  subject: 'Reset your password',
  text: [
    'Someone asked to reset the password of your account. To choose a new password, open this link:',
    '',
    url,
    '',
    `The link works for ${resetLinkLifetime}, once.`,
    'If you did not ask for this, ignore this email: your password stays as it is.',
    '',
  ].join('\n'),
})

/**
 * Better Auth's own password reset, sending the link with `mailer`. Resetting ends the user's sessions, so a reset
 * after a leaked password also signs out whoever used it.
 */
export const passwordResetOptions = (mailer: Mailer) =>
  ({
    resetPasswordTokenExpiresIn: resetLinkLifetimeSeconds,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: ({ user, url }) => mailer.send(resetEmail({ to: user.email, url })),
  }) satisfies Partial<NonNullable<BetterAuthOptions['emailAndPassword']>>
