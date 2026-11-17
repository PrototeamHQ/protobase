import { ddl } from '../ddl'
import type { StoreMigration } from './migration'

/**
 * One account per provider and its account id, so two first sign-ins with the same account at once link it once; and
 * the device accounts people signed out of, which never sign in or link again.
 */
export const accountKeys: StoreMigration = {
  version: 11,
  name: 'account_keys',
  title: 'One account per provider and account id, and the device accounts people signed out of',
  tables: ['refused_account'],
  statements: ({ table, user, id, idRef }) => [
    ddl`create unique index account_provider_id_account_id_uidx on ${table('account')} (provider_id, account_id)`,
    ddl`create table ${table('refused_account')} (
  id ${id} primary key,
  provider_id text not null,
  account_id text not null,
  user_id ${idRef} not null references ${user} (id) on delete cascade,
  created_at timestamptz not null,
  unique (provider_id, account_id)
)`,
    ddl`create index refused_account_user_id_idx on ${table('refused_account')} (user_id)`,
  ],
}
