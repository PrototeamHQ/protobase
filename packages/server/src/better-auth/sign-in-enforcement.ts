import { signInPolicyMethods, type SignInPolicy, type SignInPolicyMethod } from './sign-in-policy'

export type SignInRefusal = { code: string; message: string }

// The Better Auth endpoints behind each method, as `ctx.path` names them (without `/api/auth`).
const passwordPaths = ['/sign-in/email', '/request-password-reset', '/reset-password']
const emailCodePaths = ['/sign-in/email-otp']
const passkeyPaths = ['/passkey/generate-authenticate-options', '/passkey/verify-authentication', '/passkey/generate-register-options', '/passkey/verify-registration']

// Endpoints the plugin checks against the account, besides those of a method.
const accountPaths = ['/email-otp/send-verification-otp', '/passkey/delete-passkey', '/two-factor/enable', '/two-factor/disable', '/token']

/** Whether the policy can refuse a request to `path`; every other request goes through without reading the policy. */
export const isPoliced = (path: string | undefined) =>
  path !== undefined && ([...passwordPaths, ...emailCodePaths, ...passkeyPaths, ...accountPaths].includes(path) || path.startsWith('/reset-password/'))

const methodOf = (path: string, body: unknown): SignInPolicyMethod | undefined => {
  if (passwordPaths.includes(path) || path.startsWith('/reset-password/')) return 'password'
  if (emailCodePaths.includes(path)) return 'emailCode'
  if (path === '/email-otp/send-verification-otp' && (body as { type?: unknown } | undefined)?.type === 'sign-in') return 'emailCode'
  if (passkeyPaths.includes(path)) return 'passkey'
  if (path === '/two-factor/enable') return 'twoFactor'
  return undefined
}

/**
 * Why the policy refuses a request to Better Auth at `path`, or `undefined` when it lets it through: a method the
 * policy turns off, or turning off two-factor authentication while the policy requires it. Removing the last passkey
 * while passkeys are required depends on the account, so the plugin checks that itself.
 */
export const policyRefusal = (policy: SignInPolicy, { path, body }: { path: string; body?: unknown }): SignInRefusal | undefined => {
  const method = methodOf(path, body)
  if (method && policy[method] === 'forbidden') return { code: 'SIGN_IN_METHOD_FORBIDDEN', message: signInPolicyMethods[method].forbidden }
  if (path === '/two-factor/disable' && policy.twoFactor === 'required') {
    return { code: 'TWO_FACTOR_REQUIRED', message: 'Two-factor authentication is required for every account, so it cannot be turned off.' }
  }
  return undefined
}

/** The answer of `/token` to someone who has not set up what the policy requires. */
export const setupRequired: SignInRefusal = { code: 'SIGN_IN_SETUP_REQUIRED', message: 'Set up what this app requires for signing in first.' }

export const lastPasskeyRequired: SignInRefusal = { code: 'PASSKEY_REQUIRED', message: 'Passkeys are required for every account, so the last one cannot be removed.' }
