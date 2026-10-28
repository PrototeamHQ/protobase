// Supabase Auth (GoTrue) keeps each single sign-on (SAML) user as a row of auth.users of its own, `is_sso_user`, which
// may share its address with a password user's row: its unique index on email skips those rows, and so do its lookups
// by email, so only the identity provider opens one. Better Auth finds users by email alone: after the import a
// password user could get the SSO row back and be refused, and an emailed code or a password reset would open an SSO
// row without its identity provider. So the import refuses a Supabase project with SSO users.

/** Runs a query and gives its rows. */
type Query = (text: string) => Promise<readonly Record<string, unknown>[]>

/** The SSO users of auth.users: how many share their address with another of its rows, and how many do not. */
export type SsoUsers = { shared: number; alone: number }

/** The query that lists the SSO users, which the refusal prints instead of their addresses. */
export const ssoUsersQuery = 'select id, email from auth.users where is_sso_user'

/** Counts the SSO users of auth.users; none where GoTrue's schema predates `is_sso_user`. */
export const countSsoUsers = async (query: Query): Promise<SsoUsers> => {
  const column = await query(`select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'is_sso_user'`)
  if (column.length === 0) return { shared: 0, alone: 0 }
  const [row] = await query(
    `select count(*) filter (where shared)::int as shared, count(*) filter (where not shared)::int as alone from (select exists (select 1 from auth.users other where other.id <> sso.id and lower(other.email) = lower(sso.email)) as shared from auth.users sso where sso.is_sso_user) as sso`,
  )
  return { shared: row!.shared as number, alone: row!.alone as number }
}

const users = (count: number) => `${count} ${count === 1 ? 'user' : 'users'}`

/**
 * Fails when the Supabase project has SSO users, saying how many, how to list them and what deleting one does. It
 * prints no address, since CLI output gets pasted into issues, and offers no fix: what to do with the users is the
 * developer's call.
 */
export const refuseSsoUsers = ({ shared, alone }: SsoUsers) => {
  const count = shared + alone
  if (count === 0) return
  throw new Error(
    [
      `The Supabase project has ${count} single sign-on (SAML) ${count === 1 ? 'user' : 'users'}, which the import cannot carry over: Supabase opens them only through their identity provider, and Better Auth would find them by email.`,
      `${users(shared)} ${shared === 1 ? 'shares its' : 'share their'} address with another user of auth.users, ${users(alone)} ${alone === 1 ? 'has' : 'have'} an address of ${alone === 1 ? 'its' : 'their'} own.`,
      `List them in Supabase with: ${ssoUsersQuery}`,
      `Deleting a user in Supabase deletes or breaks the app's rows that reference it: a foreign key to auth.users that cascades deletes them, one that sets null leaves them without their user, and any other refuses the delete.`,
      `What to do about these users is your decision, not the import's: decide it in Supabase, then import again`,
    ].join('\n'),
  )
}
