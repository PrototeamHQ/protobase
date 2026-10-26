import { ddl } from '../ddl'
import type { StoreMigration } from './migration'

/** The log of the operator's staff signing in as the app's people. */
export const staffSignIn: StoreMigration = {
  version: 5,
  name: 'staff_sign_in',
  title: "The log of staff sign-ins as the app's people",
  tables: ['staff_sign_in'],
  statements: ({ table, id }) => [
    ddl`create table ${table('staff_sign_in')} (
  id ${id} primary key,
  user_id text not null,
  user_email text not null,
  staff text not null,
  staff_name text,
  staff_subject text not null,
  issuer text not null,
  reason text not null,
  session_id text not null,
  started_at timestamptz not null,
  expires_at timestamptz not null,
  ended_at timestamptz
)`,
  ],
}
