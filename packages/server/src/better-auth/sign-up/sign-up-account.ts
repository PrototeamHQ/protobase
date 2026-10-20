import { APIError } from 'better-auth/api'
import type { AuthContext } from '../organizations/store'

export type SignedUpAccount = {
  email: string
  name: string
  role: string
  /** The password, hashed as Better Auth hashes it; none for someone who signs in with emailed codes only. */
  passwordHash?: string
  /** What lands in the user metadata column, which the app must have. */
  metadata?: Record<string, unknown>
}

/** Makes the account of someone who proved their address with a sign-up code: verified, with the sign-up role. */
export const createSignedUpAccount = async (context: AuthContext, { email, name, role, passwordHash, metadata }: SignedUpAccount) => {
  const { internalAdapter } = context
  if (await internalAdapter.findUserByEmail(email)) {
    throw new APIError('BAD_REQUEST', { code: 'ACCOUNT_EXISTS', message: 'This address has an account already: sign in instead.' })
  }
  const user = await internalAdapter.createUser({ email, name, emailVerified: true, role, ...(metadata && { metadata }) }, { method: 'sign-up' })
  if (passwordHash !== undefined) await internalAdapter.linkAccount({ userId: user.id, providerId: 'credential', accountId: user.id, password: passwordHash })
  return user
}
