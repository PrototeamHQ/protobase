import type { Locale } from '@protobase/schema/internal'
import type { PluginRef } from './types'

export type AuthUser = { id: string; email: string; name: string; role?: string | null }

/** A way to sign in the server offers: a password, a code emailed to the address, or a passkey. */
export type SignInMethod = 'password' | 'emailCode' | 'passkey'

/** The second step of a sign-in: a code from an authenticator app (`totp`), or one emailed for it (`otp`). A backup code works whenever `totp` does. */
export type TwoFactorMethod = 'totp' | 'otp'

/** A sign-in either finished, or waits for the second step with one of `methods`. */
export type SignInResult = { kind: 'signed-in'; user: AuthUser } | { kind: 'two-factor'; methods: TwoFactorMethod[] }

/**
 * A sign-in provider the platform adds to the app: its id, as in `socialProviders`, the name to show, `hidden` when
 * the account page neither lists nor connects it, and `button: false` when the sign-in page shows no button for it,
 * which a sign-in link (`?sign-in=<id>`) still starts.
 */
export type PlatformSignIn = { provider: string; name: string; hidden?: boolean; button?: false }

/**
 * A mail provider people may link their own mailbox with, for the app to send mail from it: its id and name, such as
 * `gmail` and `Gmail`, the sign-in provider it links through, such as `google`, the scopes the link asks for and more
 * authorization parameters of the link.
 */
export type PersonalMailLink = { id: string; name: string; provider: string; scopes: string[]; params: Record<string, string> }

/** What open sign-up asks for: the address always, and the person's name unless the app asks for the address only. */
export type SignUpField = 'email' | 'name'

/** A SAML identity provider of the app: its id, for `signInSaml`, and the name to show. */
export type SamlSignIn = { id: string; name: string }

/**
 * `needsAdmin` while no user exists yet, with `firstAdminUrl` the platform's page where the first one is added, when it names one; `signInMethods` the ways to sign in the server's policy leaves on;
 * `signInFirst` when the sign-in page leads with an emailed code, with the password behind "Use a password"; `passwordReset` when the server can email reset links; `changeEmail` when it can email the code that confirms a new
 * address (see `account.requestEmailChange`); `accountDeletion` when people may delete their own account (see
 * `deleteAccount`); `signUp` when anyone can make their own account (see
 * `sendSignUpCode`), with `signUpFields` what it asks for, the name too or the address only; `socialProviders` the ids of the sign-in providers, for example
 * `github`; `platformProviders` those of them the platform adds, with their names; `deviceLinks` when the platform links devices too, which `account.deviceLinks` lists; `samlProviders` the app's SAML identity providers; `staffSignIn` the operator provider's name when its staff
 * can sign in as people; `organizations` when the app has them; `anonymous` when visitors may browse what the project's
 * anonymous role reads without signing in; `personalMail` the mail providers people may link their mailbox with (see `account.linkPersonalMail`); `mcp` when MCP clients can connect, with the `url` of the app's MCP endpoint, so the account page shows it and lists the clients; `plugins`
 * those the app loads before anyone signs in; `locale` the language the app sets for everyone, which the screens before
 * `/meta` are in; `appName` and `appIcon` the app's name and the path of its own icon, which those screens show;
 * `runsOnNote` when the host has the sign-in page end on the "Runs on Protobase" note.
 */
export type SetupStatus = {
  needsAdmin: boolean
  firstAdminUrl?: string
  signInMethods: SignInMethod[]
  signInFirst?: 'emailCode'
  passwordReset: boolean
  changeEmail?: boolean
  accountDeletion?: boolean
  signUp?: boolean
  signUpFields?: SignUpField[]
  socialProviders: string[]
  platformProviders?: PlatformSignIn[]
  /** The ids of the platform's providers that take token sign-in, by token alone too. */
  tokenProviders?: string[]
  deviceLinks?: boolean
  samlProviders: SamlSignIn[]
  staffSignIn?: string
  /**
   * When people have passkeys made for more than one of the app's domains: those domains, the one new passkeys are made
   * for first. A passkey sign-in asks for one at a time (see `signInWithPasskey`).
   */
  passkeyDomains?: string[]
  /**
   * With organizations: who may create them, and every role with its label, `membership` for those a member can hold;
   * what the app calls an organization, and the line under the title of the screen where someone names their first one,
   * when it sets them.
   */
  organizations?: { create: 'admins' | 'everyone'; roles: RoleLabel[]; names?: { singular: string; plural: string }; createDescription?: string }
  anonymous?: boolean
  mcp?: { url: string }
  /** People may make personal access tokens for their scripts, on the account page. */
  personalAccessTokens?: true
  personalMail?: PersonalMailLink[]
  plugins?: PluginRef[]
  locale?: Locale
  appName?: string
  appIcon?: string
  runsOnNote?: boolean
}

/** A role with its label; `membership` when a member can hold it, `grants` the other roles its holders may give. */
export type RoleLabel = { name: string; label: string; membership: boolean; grants: string[] }
