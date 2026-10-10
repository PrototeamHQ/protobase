export type AuthUser = { id: string; email: string; name: string; role?: string | null }

/** A way to sign in the server offers: a password, a code emailed to the address, or a passkey. */
export type SignInMethod = 'password' | 'emailCode' | 'passkey'

/** The second step of a sign-in: a code from an authenticator app (`totp`), or one emailed for it (`otp`). A backup code works whenever `totp` does. */
export type TwoFactorMethod = 'totp' | 'otp'

/** A sign-in either finished, or waits for the second step with one of `methods`. */
export type SignInResult = { kind: 'signed-in'; user: AuthUser } | { kind: 'two-factor'; methods: TwoFactorMethod[] }

/**
 * `needsAdmin` while no user exists yet; `signInMethods` the ways to sign in the server's policy leaves on;
 * `passwordReset` when the server can email reset links; `socialProviders` the ids of the sign-in providers, for example
 * `github`; `staffSignIn` the operator provider's name when its staff can sign in as people.
 */
export type SetupStatus = { needsAdmin: boolean; signInMethods: SignInMethod[]; passwordReset: boolean; socialProviders: string[]; staffSignIn?: string }
