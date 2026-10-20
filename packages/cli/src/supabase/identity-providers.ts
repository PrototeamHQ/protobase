import type { Sql } from '../db/connect'

// Supabase Auth (GoTrue) keeps each way a user signs in as a row of auth.identities, named by its provider; Better
// Auth keeps each as an account. These are what carries one over: the provider's name as Better Auth knows it, and
// the claim Better Auth keys the account on, where GoTrue's provider_id holds another.

/** GoTrue's providers that Better Auth names otherwise. */
const renamed: Record<string, string> = { azure: 'microsoft', linkedin_oidc: 'linkedin', slack_oidc: 'slack', x: 'twitter' }

/**
 * Where Better Auth keys the account on a claim other than the subject GoTrue keeps as provider_id: Microsoft's
 * `oid`, which GoTrue keeps among the ID token's custom claims.
 */
const subjects: Record<string, string> = { azure: `identity_data->'custom_claims'->>'oid'` }

/** GoTrue's providers that carry no account over: email and phone sign in on the user, anonymous has nothing to. */
const withoutAccount = ['email', 'phone', 'anonymous']

/** The social providers Better Auth 1.7 has built in that GoTrue has too, by Better Auth's names. */
const builtIn = ['apple', 'discord', 'facebook', 'figma', 'github', 'gitlab', 'google', 'kakao', 'linkedin', 'microsoft', 'notion', 'slack', 'spotify', 'twitch', 'twitter', 'zoom']

/** What becomes of a GoTrue provider's identities. */
export type ProviderFate =
  | { kind: 'none'; reason: string }
  /** `builtIn`: Better Auth has a provider by that name; otherwise only a generic OAuth setup signs in with it. */
  | { kind: 'account'; providerId: string; builtIn: boolean }

export const providerFate = (provider: string): ProviderFate => {
  if (withoutAccount.includes(provider)) return { kind: 'none', reason: provider === 'anonymous' ? 'anonymous users have nothing to sign in with' : `${provider} sign-in lives on the user, not in an account` }
  if (provider.startsWith('sso:')) return { kind: 'none', reason: 'single sign-on providers are set up again in the app' }
  const providerId = renamed[provider] ?? provider
  return { kind: 'account', providerId, builtIn: builtIn.includes(providerId) }
}

const literal = (text: string) => `'${text.replaceAll("'", "''")}'`

/** SQL over an auth.identities row: the provider id its account gets. */
export const accountProviderSql = `case provider ${Object.entries(renamed)
  .map(([from, to]) => `when ${literal(from)} then ${literal(to)} `)
  .join('')}else provider end`

/** SQL over an auth.identities row: the account id its account gets, NULL where the claim is missing. */
export const accountIdSql = `case provider ${Object.entries(subjects)
  .map(([provider, claim]) => `when ${literal(provider)} then ${claim} `)
  .join('')}else provider_id end`

/** SQL over an auth.identities row: whether it carries an account over. */
export const carriesAccountSql = `provider <> all(array[${withoutAccount.map(literal).join(', ')}]) and provider not like 'sso:%'`

/**
 * SQL over an auth.identities row: whether its user may sign in with it. GoTrue refuses a provider sign-in to a user
 * with an unconfirmed address, though it keeps the user and the identity, and Better Auth would not refuse it: whoever
 * signed in with a provider account claiming someone else's address could then sign in as them. A user without an
 * address has nobody's to claim, and GoTrue lets those in where the provider's email is optional.
 */
export const confirmedOwnerSql = `user_id in (select id from auth.users where email is null or email_confirmed_at is not null)`

/**
 * How many identities a provider has in the loaded auth.identities, how many lack the claim their account needs, and
 * how many of the rest belong to a user who never confirmed their address.
 */
export type ProviderCount = { provider: string; identities: number; unkeyed: number; unconfirmed: number }

/** The loaded auth.identities, counted by provider, for the report. */
export const providerCounts = (sql: Sql) =>
  sql.unsafe<ProviderCount[]>(
    `select provider, count(*)::int as identities, count(*) filter (where ${accountIdSql} is null)::int as unkeyed, count(*) filter (where ${accountIdSql} is not null and not (${confirmedOwnerSql}))::int as unconfirmed from auth.identities group by 1 order by 1`,
  )
