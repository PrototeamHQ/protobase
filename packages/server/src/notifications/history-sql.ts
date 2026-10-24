import { quoteIdent } from '../changes/capture-sql'
import type { HistoryNames } from './options'
import { qualified } from './schema-sql'

/**
 * The history table: with auth, its user column points at auth's users table and goes with the user. `read_at` is NULL
 * while unread and nothing has a default. One index serves a user's newest-first pages, another their unread ones.
 */
export const historyTableSql = ({ schema, table, columns }: HistoryNames, user: { type: string; references?: string }) => {
  const c = Object.fromEntries(Object.entries(columns).map(([name, value]) => [name, quoteIdent(value)])) as Record<keyof typeof columns, string>
  const history = qualified({ schema, table })
  return [
    `create schema if not exists ${quoteIdent(schema)}`,
    `create table ${history} (
  ${c.id} uuid primary key,
  ${c.user_id} ${user.type} not null${user.references ? ` references ${user.references} on delete cascade` : ''},
  ${c.title} text not null,
  ${c.body} text,
  ${c.url} text,
  ${c.data} jsonb,
  ${c.created_at} timestamptz not null,
  ${c.read_at} timestamptz
)`,
    `create index on ${history} (${c.user_id}, ${c.created_at} desc, ${c.id} desc)`,
    `create index on ${history} (${c.user_id}, ${c.created_at}) where ${c.read_at} is null`,
  ]
}
