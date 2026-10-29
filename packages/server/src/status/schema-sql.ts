import { quoteIdent } from '../changes/capture-sql'
import { qualified } from '../notifications/schema-sql'
import type { StatusNames } from './options'

/**
 * The statuses table: one row per person who set a status, which goes with the user. A custom text or a clear time
 * not set is NULL, and nothing has a default. Clearing a status deletes its row.
 */
export const statusesTableSql = ({ schema, table }: StatusNames, user: { type: string; references: string }) => [
  `create schema if not exists ${quoteIdent(schema)}`,
  `create table ${qualified({ schema, table })} (
  user_id ${user.type} primary key references ${user.references} on delete cascade,
  availability text not null check (availability in ('automatic', 'busy', 'do_not_disturb')),
  text text check (char_length(text) between 1 and 100),
  clears_at timestamptz,
  updated_at timestamptz not null
)`,
]
