import { quoteIdent } from '../changes/capture-sql'
import type { NotificationsNames } from './options'

/** A table by its schema, when one is named, and its name, quoted. */
export const qualified = ({ schema, table }: { schema?: string | undefined; table: string }) => (schema ? `${quoteIdent(schema)}.${quoteIdent(table)}` : quoteIdent(table))

/**
 * The devices table: the token unique, so registering one moves it; with auth, its user column points at auth's users
 * table and goes with the user. A field that does not apply to the kind must be NULL, and nothing has a default.
 */
export const devicesTableSql = ({ schema, table, columns }: NotificationsNames, user: { type: string; references?: string }) => {
  const c = Object.fromEntries(Object.entries(columns).map(([name, value]) => [name, quoteIdent(value)])) as Record<keyof typeof columns, string>
  const devices = qualified({ schema, table })
  return [
    `create schema if not exists ${quoteIdent(schema)}`,
    `create table ${devices} (
  ${c.id} uuid primary key,
  ${c.user_id} ${user.type} not null${user.references ? ` references ${user.references} on delete cascade` : ''},
  ${c.kind} text not null check (${c.kind} in ('web', 'apns', 'fcm')),
  ${c.token} text not null,
  ${c.p256dh} text,
  ${c.auth} text,
  ${c.environment} text check (${c.environment} in ('sandbox', 'production')),
  ${c.app_id} text,
  ${c.user_agent} text,
  ${c.created_at} timestamptz not null,
  ${c.last_seen_at} timestamptz not null,
  check (
    (${c.kind} = 'web' and ${c.p256dh} is not null and ${c.auth} is not null and ${c.environment} is null and ${c.app_id} is null)
    or (${c.kind} = 'apns' and ${c.p256dh} is null and ${c.auth} is null and ${c.environment} is not null and ${c.app_id} is not null)
    or (${c.kind} = 'fcm' and ${c.p256dh} is null and ${c.auth} is null and ${c.environment} is null)
  )
)`,
    `create unique index on ${devices} (${c.token})`,
    `create index on ${devices} (${c.user_id})`,
  ]
}
