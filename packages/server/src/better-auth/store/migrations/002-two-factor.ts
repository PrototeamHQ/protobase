import { ddl } from '../ddl'
import type { StoreMigration } from './migration'

/** Two-step sign-in: each user's authenticator secret and backup codes. */
export const twoFactor: StoreMigration = {
  version: 2,
  name: 'two_factor',
  title: 'The authenticator secrets and backup codes of two-step sign-in',
  tables: ['two_factor'],
  statements: ({ table, user, userColumn: column, id, idRef }) => [
    ddl`alter table ${user} add column if not exists ${column('two_factor_enabled')} boolean`,
    ddl`create table ${table('two_factor')} (
  id ${id} primary key,
  secret text not null,
  backup_codes text not null,
  user_id ${idRef} not null references ${user} (id) on delete cascade,
  verified boolean,
  failed_verification_count integer,
  locked_until timestamptz
)`,
    ddl`create index two_factor_secret_idx on ${table('two_factor')} (secret)`,
    ddl`create index two_factor_user_id_idx on ${table('two_factor')} (user_id)`,
  ],
}
