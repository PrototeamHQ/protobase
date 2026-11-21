import { ddl } from '../../ddl'
import type { Step } from '../step'

/** The personal access tokens people make for their scripts: each one's hash, never the token. */
export const personalAccessTokens: Step = {
  step: 1,
  version: 8,
  name: 'personal_access_tokens',
  title: "The personal access tokens people make for their scripts, by their tokens' hashes",
  tables: ['personal_access_token'],
  statements: ({ table, user, id, idRef }) => {
    const token = table('personal_access_token')
    const t = token.columns
    return [
      ddl`create table ${token} (
  id ${id} primary key,
  ${t.user_id} ${idRef} not null references ${user} (id) on delete cascade,
  ${t.name} text not null,
  ${t.token_hash} text not null unique,
  ${t.role} text not null,
  ${t.created_at} timestamptz not null,
  ${t.expires_at} timestamptz,
  ${t.last_used_at} timestamptz
)`,
      ddl`create index ${token.index('personal_access_token_user_id_idx')} on ${token} (${t.user_id})`,
    ]
  },
}
