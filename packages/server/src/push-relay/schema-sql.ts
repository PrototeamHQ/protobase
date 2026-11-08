/** The schema the relay keeps its handles and credentials in. */
export const pushRelaySchema = 'push_relay'

export const handlesTable = `${pushRelaySchema}.handles`
export const credentialsTable = `${pushRelaySchema}.credentials`

/**
 * The handles: one per device token and workspace origin, so registering again finds the same handle. An APNs token
 * has its environment, an FCM token none. Nothing has a default.
 */
export const handlesTableSql = `create table ${handlesTable} (
  handle text primary key,
  kind text not null check (kind in ('apns', 'fcm')),
  token text not null,
  environment text check (environment in ('sandbox', 'production')),
  origin text not null,
  created_at timestamptz not null,
  unique (token, origin),
  check ((kind = 'apns') = (environment is not null))
)`

/**
 * The workspace credentials: each bound to one origin, kept only as the SHA-256 of its secret. `hour` and `sent` count
 * the devices sent to in the clock hour that `hour` starts; both are NULL until its first send.
 */
export const credentialsTableSql = `create table ${credentialsTable} (
  id uuid primary key,
  origin text not null,
  secret_hash bytea not null check (octet_length(secret_hash) = 32),
  created_at timestamptz not null,
  hour timestamptz,
  sent integer check (sent >= 0)
)`
