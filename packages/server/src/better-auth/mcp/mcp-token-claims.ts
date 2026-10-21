import { APIError } from 'better-auth/api'
import { mayEnter } from '../organizations/session-organization'
import type { AuthContext } from '../organizations/store'
import { heldRoles } from '../roles/session-role'
import type { SignInPolicy } from '../sign-in-policy'
import { missingSetup } from '../sign-in-setup'
import { tokenClaims } from '../token-claims'
import { readGrantReference } from './grant-reference'

/** The user row the provider passes when it issues a token, as the admin, two-factor and roles plugins extend it. */
export type GrantUser = {
  id: string
  email: string
  emailVerified?: boolean | null
  role?: string | null
  banned?: boolean | null
  banExpires?: Date | string | null
  twoFactorEnabled?: boolean | null
}

export type McpTokenClaimsOptions = {
  /** Organizations are on. */
  organizations: boolean
  /** Mail can be sent, as the sign-in policy reads it. */
  mail: boolean
  /** The policy until an admin saves one, from `appSignInPolicy`. */
  defaultPolicy: SignInPolicy
  /** Now; the clock the ban's expiry is read against. */
  now?: Date
}

const refused = (description: string) => new APIError('BAD_REQUEST', { error: 'invalid_grant', error_description: description })

// Better Auth's own rule: a ban whose `banExpires` has passed no longer holds (the admin plugin lifts it at sign-in).
const isBanned = (user: GrantUser, now: Date) => Boolean(user.banned) && !(user.banExpires && new Date(user.banExpires) < now)

/**
 * The claims of an MCP access token, issued at the code exchange and at every refresh: the role and organization the
 * grant was made with (its consent's `referenceId`), checked again each time. It refuses (`invalid_grant`) a grant
 * without a user, for a banned user, an address that is not verified, setup the sign-in policy now requires, a grant
 * made with no role, and a role or organization the user no longer holds; so a refresh stops once any of those holds.
 */
export const mcpTokenClaims = async (context: AuthContext, { organizations, mail, defaultPolicy, now = new Date() }: McpTokenClaimsOptions, user: GrantUser | null | undefined, referenceId: string | undefined) => {
  if (!user) throw refused('This grant has no user.')
  if (isBanned(user, now)) throw refused('This account is blocked.')
  if (user.emailVerified !== true) throw refused('Confirm your address by signing in with an emailed code, then connect again.')
  if ((await missingSetup(context, user, { mail, defaultPolicy })).length > 0) throw refused("Set up what this app's sign-in policy requires, then try again.")
  const { role, organization } = readGrantReference(referenceId)
  if (!role) throw refused('You had no role in this app when you allowed this client: connect it again.')
  const held = await heldRoles(context, user, { activeOrganizationId: organization ?? null })
  const entered = !organizations || !organization || (await mayEnter(context.adapter, user, organization))
  if (!held.includes(role) || !entered) throw refused('Your role or organization changed since you allowed this client: connect it again.')
  return tokenClaims(user, { wanted: [role], organizationId: organization ?? null, ...(organizations && { organizations: context.adapter }) })
}
