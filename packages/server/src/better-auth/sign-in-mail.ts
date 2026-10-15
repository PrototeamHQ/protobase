import type { BetterAuthOptions } from 'better-auth'
import type { emailOTP, twoFactor } from 'better-auth/plugins'
import { sendAuthEmail, type AuthMail } from './auth-mail/send-auth-email'

/** How long an emailed code works: in seconds for the sign-in code, in minutes for the two-factor one, and in the email's words. */
export const codeLifetimeSeconds = 5 * 60
const codeLifetimeMinutes = 5
const codeLifetime = '5 minutes'

type EmailOtpOptions = Parameters<typeof emailOTP>[0]

/**
 * Better Auth's email OTP plugin as sign-in only: never a sign-up, codes stored hashed, sent with `mail`. The
 * plugin's other uses (email verification, its own password reset, changing the address) are not offered.
 */
export const emailCodeOptions = (mail: AuthMail) =>
  ({
    disableSignUp: true,
    expiresIn: codeLifetimeSeconds,
    storeOTP: 'hashed',
    sendVerificationOTP: ({ email, otp }, ctx) => sendAuthEmail(mail, 'signInCodeEmail', email, { code: otp, lifetime: codeLifetime }, ctx?.context.baseURL),
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

/** The two-factor plugin's emailed code, sent with `mail`; stored hashed. */
export const twoFactorCodeOptions = (mail: AuthMail) =>
  ({
    period: codeLifetimeMinutes,
    storeOTP: 'hashed',
    sendOTP: ({ user, otp }, ctx) => sendAuthEmail(mail, 'twoFactorCodeEmail', user.email, { code: otp, lifetime: codeLifetime }, ctx?.context.baseURL),
  }) satisfies TwoFactorOptions['otpOptions']
