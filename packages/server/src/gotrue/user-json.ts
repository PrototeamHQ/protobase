// A Better Auth user, and the accounts it signs in with, as GoTrue's user object, the one `supabase.auth.getUser()`
// answers. Only what the store holds: a field it has nothing for is left out.

export type StoredUser = {
  id: string
  email: string
  emailConfirmedAt?: Date | string | null
  createdAt: Date | string
  updatedAt: Date | string
  /** The user metadata column's value, when the app has one (`auth.users.metadata`). */
  metadata?: unknown
}

export type StoredAccount = { id: string; providerId: string; accountId: string; userId: string; createdAt: Date | string; updatedAt: Date | string }

const iso = (value: Date | string) => new Date(value).toISOString()

// GoTrue calls a password account's provider `email`; a sign-in provider keeps its id, such as `github`.
const providerName = (providerId: string) => (providerId === 'credential' ? 'email' : providerId)

const byAge = (accounts: StoredAccount[]) => [...accounts].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

/** `app_metadata`: the provider the user first signed in with, and every one they can. */
export const appMetadata = (accounts: StoredAccount[]) => {
  const providers = [...new Set(byAge(accounts).map((account) => providerName(account.providerId)))]
  return providers.length === 0 ? {} : { provider: providers[0]!, providers }
}

/** `user_metadata`: the user metadata column's object, read as the store returns JSON; empty without one. */
export const userMetadata = (metadata: unknown): Record<string, unknown> => {
  const value = typeof metadata === 'string' ? JSON.parse(metadata) : metadata
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

/** The GoTrue user object of `user`. `confirmed_at` is the address's confirmation, as phones are not offered. */
export const goTrueUser = (user: StoredUser, accounts: StoredAccount[]) => {
  const confirmedAt = user.emailConfirmedAt ? iso(user.emailConfirmedAt) : undefined
  return {
    id: user.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: user.email,
    ...(confirmedAt && { email_confirmed_at: confirmedAt, confirmed_at: confirmedAt }),
    app_metadata: appMetadata(accounts),
    user_metadata: userMetadata(user.metadata),
    identities: byAge(accounts).map((account) => ({
      identity_id: account.id,
      id: account.accountId,
      user_id: account.userId,
      provider: providerName(account.providerId),
      created_at: iso(account.createdAt),
      updated_at: iso(account.updatedAt),
    })),
    created_at: iso(user.createdAt),
    updated_at: iso(user.updatedAt),
    is_anonymous: false,
  }
}

export type GoTrueUser = ReturnType<typeof goTrueUser>
