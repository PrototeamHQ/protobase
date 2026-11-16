import { APIError } from 'better-auth/api'
import type { AuthContext } from '../organizations/store'
import { deleteAppInvitation, findAppInvitationOf } from '../users/app-invitation-store'

export type SignedUpAccount = {
  email: string
  /** The person's name; empty when the app asks for the address only. */
  name: string
  role: string
  /** The password, hashed as Better Auth hashes it; none for someone who signs in with emailed codes only. */
  passwordHash?: string
  /** What lands in the user metadata column, which the app must have. */
  metadata?: Record<string, unknown>
}

/**
 * Makes the account of someone who proved their address with an emailed code: verified, with the sign-up role. An
 * address with a pending invitation to the app is made through it instead: with the roles the admin chose, and the
 * invitation used up, as its link would. An expired or revoked invitation is none.
 */
export const createSignedUpAccount = async (context: AuthContext, { email, name, role, passwordHash, metadata }: SignedUpAccount) => {
  const { internalAdapter } = context
  if (await internalAdapter.findUserByEmail(email)) {
    throw new APIError('BAD_REQUEST', { code: 'ACCOUNT_EXISTS', message: 'This address has an account already: sign in instead.' })
  }
  const invitation = await findAppInvitationOf(context, email)
  const roles = invitation ? invitation.roles.join(',') : role
  const user = await internalAdapter.createUser({ email, name, emailVerified: true, role: roles, ...(metadata && { metadata }) }, { method: invitation ? 'invitation' : 'sign-up' })
  if (passwordHash !== undefined) await internalAdapter.linkAccount({ userId: user.id, providerId: 'credential', accountId: user.id, password: passwordHash })
  if (invitation) await deleteAppInvitation(context, invitation.id)
  return { ...user, role: roles }
}
