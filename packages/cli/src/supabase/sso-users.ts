// Supabase Auth (GoTrue) keeps each single sign-on (SAML) user as a row of auth.users of its own, `is_sso_user`, which
// may share its address with a password user's row: its unique index on email skips those rows, and so do its lookups
// by email, so only the identity provider opens one. Better Auth finds users by email alone: after the import a
// password user could get the SSO row back and be refused, and an emailed code or a password reset would open an SSO
// row without its identity provider. So the import refuses a Supabase project with SSO users.

/** Runs a query and gives its rows. */
type Query = (text: string) => Promise<readonly Record<string, unknown>[]>

/** How many of auth.users are SSO users; none where GoTrue's schema predates `is_sso_user`. */
export const ssoUserCount = async (query: Query) => {
  const column = await query(`select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'is_sso_user'`)
  if (column.length === 0) return 0
  const [row] = await query(`select count(*)::int as count from auth.users where is_sso_user`)
  return row!.count as number
}

/** Fails, saying what to do first, when the Supabase project has SSO users. */
export const refuseSsoUsers = (count: number) => {
  if (count === 0) return
  throw new Error(
    `The Supabase project has ${count} single sign-on (SAML) ${count === 1 ? 'user' : 'users'}, which the import cannot carry over: Supabase opens them only through their identity provider, and Better Auth would find them by email. Merge them into the users with the same address or delete them in Supabase, then import again`,
  )
}
