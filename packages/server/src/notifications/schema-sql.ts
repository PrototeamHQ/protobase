import { quoteIdent } from '../changes/capture-sql'
import type { NotificationsNames } from './options'

/** A table by its schema, when one is named, and its name, quoted. */
export const qualified = ({ schema, table }: { schema?: string | undefined; table: string }) => (schema ? `${quoteIdent(schema)}.${quoteIdent(table)}` : quoteIdent(table))

/** The session column, added to a devices table written before devices kept the session they were registered in. */
export const deviceSessionColumnSql = ({ schema, table, columns }: NotificationsNames) => `alter table ${qualified({ schema, table })} add column ${quoteIdent(columns.session_id)} text`

type Quoted = Record<keyof NotificationsNames['columns'], string>

const quotedColumns = (columns: NotificationsNames['columns']) => Object.fromEntries(Object.entries(columns).map(([name, value]) => [name, quoteIdent(value)])) as Quoted

// The kinds a device may be, and the fields each kind has: a field that does not apply to the kind is NULL.
const kindCheck = (c: Quoted) => `check (${c.kind} in ('web', 'apns', 'fcm', 'relay'))`
const fieldsCheck = (c: Quoted) => `check (
    (${c.kind} = 'web' and ${c.p256dh} is not null and ${c.auth} is not null and ${c.environment} is null and ${c.app_id} is null)
    or (${c.kind} = 'apns' and ${c.p256dh} is null and ${c.auth} is null and ${c.environment} is not null and ${c.app_id} is not null)
    or (${c.kind} = 'fcm' and ${c.p256dh} is null and ${c.auth} is null and ${c.environment} is null)
    or (${c.kind} = 'relay' and ${c.p256dh} is null and ${c.auth} is null and ${c.environment} is null and ${c.app_id} is null)
  )`

/**
 * The kind checks, replacing `constraints`, those of a devices table written before devices could be relay devices,
 * in one statement.
 */
export const deviceKindChecksSql = ({ schema, table, columns }: NotificationsNames, constraints: readonly string[]) => {
  const c = quotedColumns(columns)
  const drops = constraints.map((name) => `drop constraint ${quoteIdent(name)}`)
  return `alter table ${qualified({ schema, table })} ${[...drops, `add ${kindCheck(c)}`, `add ${fieldsCheck(c)}`].join(', ')}`
}

/**
 * The devices table: the token unique, so registering one moves it; with auth, its user column points at auth's users
 * table and goes with the user. A field that does not apply to the kind must be NULL, and nothing has a default.
 */
export const devicesTableSql = ({ schema, table, columns }: NotificationsNames, user: { type: string; references?: string }) => {
  const c = quotedColumns(columns)
  const devices = qualified({ schema, table })
  return [
    `create schema if not exists ${quoteIdent(schema)}`,
    `create table ${devices} (
  ${c.id} uuid primary key,
  ${c.user_id} ${user.type} not null${user.references ? ` references ${user.references} on delete cascade` : ''},
  ${c.kind} text not null ${kindCheck(c)},
  ${c.token} text not null,
  ${c.p256dh} text,
  ${c.auth} text,
  ${c.environment} text check (${c.environment} in ('sandbox', 'production')),
  ${c.app_id} text,
  ${c.user_agent} text,
  ${c.session_id} text,
  ${c.created_at} timestamptz not null,
  ${c.last_seen_at} timestamptz not null,
  ${fieldsCheck(c)}
)`,
    `create unique index on ${devices} (${c.token})`,
    `create index on ${devices} (${c.user_id})`,
  ]
}
