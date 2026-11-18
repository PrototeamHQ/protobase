import { ddl } from '../ddl'
import type { StoreMigration } from './migration'

/** Two-step sign-in: each user's authenticator secret and backup codes. */
export const twoFactor: StoreMigration = {
  version: 2,
  name: 'two_factor',
  title: 'The authenticator secrets and backup codes of two-step sign-in',
  tables: ['two_factor'],
  statements: ({ table, user, userDdl, id, idRef }) => {
    const twoFactor = table('two_factor')
    const t = twoFactor.columns
    return [
      ...userDdl([ddl`alter table ${table('user')} add column if not exists ${table('user').columns.two_factor_enabled} boolean`]),
      ddl`create table ${twoFactor} (
  id ${id} primary key,
  ${t.secret} text not null,
  ${t.backup_codes} text not null,
  ${t.user_id} ${idRef} not null references ${user} (id) on delete cascade,
  ${t.verified} boolean,
  ${t.failed_verification_count} integer,
  ${t.locked_until} timestamptz
)`,
      ddl`create index ${twoFactor.index('two_factor_secret_idx')} on ${twoFactor} (${t.secret})`,
      ddl`create index ${twoFactor.index('two_factor_user_id_idx')} on ${twoFactor} (${t.user_id})`,
    ]
  },
}
