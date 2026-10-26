import { ddl } from '../ddl'
import type { StoreMigration } from './migration'

/** The sign-in policy admins save, each save a row of its own. */
export const signInPolicy: StoreMigration = {
  version: 4,
  name: 'sign_in_policy',
  title: 'The sign-in policies admins saved',
  tables: ['sign_in_policy'],
  statements: ({ table, id }) => [
    ddl`create table ${table('sign_in_policy')} (
  id ${id} primary key,
  password text not null,
  email_code text not null,
  passkey text not null,
  two_factor text not null,
  staff_access text not null,
  platform_sign_in text not null,
  created_at timestamptz not null,
  created_by text
)`,
  ],
}
