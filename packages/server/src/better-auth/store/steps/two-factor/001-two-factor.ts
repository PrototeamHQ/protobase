import { ddl } from '../../ddl'
import type { Step } from '../step'

/** Two-step sign-in: each user's authenticator secret and backup codes. */
export const twoFactor: Step = {
  step: 1,
  version: 2,
  name: 'two_factor',
  title: 'The authenticator secrets and backup codes of two-step sign-in',
  tables: ['two_factor'],
  statements: ({ table, user, id, idRef }) => {
    const twoFactor = table('two_factor')
    const t = twoFactor.columns
    return [
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
  adds: {
    auth: ({ table, userDdl }) => userDdl([ddl`alter table ${table('user')} add column if not exists ${table('user').columns.two_factor_enabled} boolean`]),
  },
}
