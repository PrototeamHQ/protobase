import type { PluginRef } from './types'

export type AuthUser = { id: string; email: string; name: string; role?: string | null }

/** A way to sign in the server offers: a password, a code emailed to the address, or a passkey. */
export type SignInMethod = 'password' | 'emailCode' | 'passkey'

/** The second step of a sign-in: a code from an authenticator app (`totp`), or one emailed for it (`otp`). A backup code works whenever `totp` does. */
export type TwoFactorMethod = 'totp' | 'otp'

/** A sign-in either finished, or waits for the second step with one of `methods`. */
export type SignInResult = { kind: 'signed-in'; user: AuthUser } | { kind: 'two-factor'; methods: TwoFactorMethod[] }

/** The sign-in provider the platform adds to the app: its id, as in `socialProviders`, and the name to show. */
export type PlatformSignIn = { provider: string; name: string }

/** A SAML identity provider of the app: its id, for `signInSaml`, and the name to show. */
export type SamlSignIn = { id: string; name: string }

/**
 * `needsAdmin` while no user exists yet; `signInMethods` the ways to sign in the server's policy leaves on;
 * `passwordReset` when the server can email reset links; `signUp` when anyone can make their own account (see
 * `sendSignUpCode`); `socialProviders` the ids of the sign-in providers, for example
 * `github`; `platformSignIn` the one of them the platform adds; `samlProviders` the app's SAML identity providers; `staffSignIn` the operator provider's name when its staff
 * can sign in as people; `organizations` when the app has them; `anonymous` when visitors may browse what the project's
 * anonymous role reads without signing in; `plugins` those the app loads before anyone signs in.
 */
export type SetupStatus = {
  needsAdmin: boolean
  signInMethods: SignInMethod[]
  passwordReset: boolean
  signUp?: boolean
  socialProviders: string[]
  platformSignIn?: PlatformSignIn
  samlProviders: SamlSignIn[]
  staffSignIn?: string
  /**
   * When people have passkeys made for more than one of the app's domains: those domains, the one new passkeys are made
   * for first. A passkey sign-in asks for one at a time (see `signInWithPasskey`).
   */
  passkeyDomains?: string[]
  /** With organizations: who may create them, and every role with its label, `membership` for those a member can hold. */
  organizations?: { create: 'admins' | 'everyone'; roles: RoleLabel[] }
  anonymous?: boolean
  plugins?: PluginRef[]
}

/** A role with its label; `membership` when a member can hold it, `grants` the other roles its holders may give. */
export type RoleLabel = { name: string; label: string; membership: boolean; grants: string[] }
