import type { BetterAuthOptions } from 'better-auth'
import type { emailOTP, twoFactor } from 'better-auth/plugins'
import type { Mailer } from '../mail/smtp-mailer'

/** How long an emailed code works: in seconds for the sign-in code, in minutes for the two-factor one, and in the email's words. */
export const codeLifetimeSeconds = 5 * 60
const codeLifetimeMinutes = 5
const codeLifetime = '5 minutes'

/** The email with a code to sign in with instead of a password. */
export const signInCodeEmail = ({ to, code }: { to: string; code: string }) => ({
  to,
  subject: 'Your sign-in code',
  text: ['Use this code to sign in:', '', code, '', `It works for ${codeLifetime}, once.`, 'If you did not try to sign in, ignore this email: nobody can sign in without the code.', ''].join('\n'),
})

/** The email with the second step of a sign-in, for an account with two-factor authentication by email. */
export const twoFactorCodeEmail = ({ to, code }: { to: string; code: string }) => ({
  to,
  subject: 'Your verification code',
  text: [
    'Use this code to finish signing in:',
    '',
    code,
    '',
    `It works for ${codeLifetime}, once.`,
    'If you did not just sign in, someone else may know your password or have your sign-in code: change your password.',
    '',
  ].join('\n'),
})

type EmailOtpOptions = Parameters<typeof emailOTP>[0]

/**
 * Better Auth's email OTP plugin as sign-in only: never a sign-up, codes stored hashed, sent with `mailer`. The
 * plugin's other uses (email verification, its own password reset, changing the address) are not offered.
 */
export const emailCodeOptions = (mailer: Mailer) =>
  ({
    disableSignUp: true,
    expiresIn: codeLifetimeSeconds,
    storeOTP: 'hashed',
    sendVerificationOTP: ({ email, otp }) => mailer.send(signInCodeEmail({ to: email, code: otp })),
  }) satisfies EmailOtpOptions

/** The email OTP plugin's endpoints Protobase does not use; `createAuth` turns them off. */
export const unusedEmailCodePaths = [
  '/email-otp/check-verification-otp',
  '/email-otp/verify-email',
  '/email-otp/request-password-reset',
  '/forget-password/email-otp',
  '/email-otp/reset-password',
  '/email-otp/request-email-change',
  '/email-otp/change-email',
] satisfies BetterAuthOptions['disabledPaths']

type TwoFactorOptions = NonNullable<Parameters<typeof twoFactor>[0]>

/** The two-factor plugin's emailed code, sent with `mailer`; stored hashed. */
export const twoFactorCodeOptions = (mailer: Mailer) =>
  ({
    period: codeLifetimeMinutes,
    storeOTP: 'hashed',
    sendOTP: ({ user, otp }) => mailer.send(twoFactorCodeEmail({ to: user.email, code: otp })),
  }) satisfies TwoFactorOptions['otpOptions']

/** The email to someone whose app lets staff sign in as people only when they are told: who, why, and until when. */
export const staffSignInEmail = ({ to, staff, reason, expiresAt }: { to: string; staff: string; reason: string; expiresAt: Date }) => ({
  to,
  subject: 'Staff signed in as you',
  text: [
    `${staff}, of the team that runs this app, signed in as you to help. The reason they gave:`,
    '',
    reason,
    '',
    `Their session ends by ${expiresAt.toUTCString()}. The app's admins see it in the app's log of staff sign-ins.`,
    'If you did not expect this, tell your admin.',
    '',
  ].join('\n'),
})
