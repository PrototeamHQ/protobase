import { ddl } from '../ddl'
import type { StoreMigration } from './migration'

/** The personal access tokens people make for their scripts: each one's hash, never the token. */
export const personalAccessTokens: StoreMigration = {
  version: 8,
  name: 'personal_access_tokens',
  title: "The personal access tokens people make for their scripts, by their tokens' hashes",
  tables: ['personal_access_token'],
  statements: ({ table, user, id, idRef }) => [
    ddl`create table ${table('personal_access_token')} (
  id ${id} primary key,
  user_id ${idRef} not null references ${user} (id) on delete cascade,
  name text not null,
  token_hash text not null unique,
  role text not null,
  organization_id ${idRef} references ${table('organization')} (id) on delete cascade,
  created_at timestamptz not null,
  expires_at timestamptz,
  last_used_at timestamptz
)`,
    ddl`create index personal_access_token_user_id_idx on ${table('personal_access_token')} (user_id)`,
  ],
}
