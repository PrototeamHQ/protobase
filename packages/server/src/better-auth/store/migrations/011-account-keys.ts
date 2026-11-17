import { ddl } from '../ddl'
import type { StoreMigration } from './migration'

/**
 * One account per provider and its account id, so two first sign-ins with the same account at once link it once; the
 * device accounts people signed out of, which never sign in or link again; and the sessions each device account began,
 * which go with the session.
 */
export const accountKeys: StoreMigration = {
  version: 11,
  name: 'account_keys',
  title: 'One account per provider and account id, the device accounts people signed out of, and the sessions of each device',
  tables: ['refused_account', 'device_session'],
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
    ddl`create table ${table('device_session')} (
  id ${id} primary key,
  session_id ${idRef} not null unique references ${table('session')} (id) on delete cascade,
  account_id text not null,
  created_at timestamptz not null
)`,
    ddl`create index device_session_account_id_idx on ${table('device_session')} (account_id)`,
  ],
}
