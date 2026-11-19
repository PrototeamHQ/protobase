import { ddl } from '../ddl'
import type { StoreMigration } from './migration'

/** The sign-in policy admins save, each save a row of its own. */
export const signInPolicy: StoreMigration = {
  version: 4,
  name: 'sign_in_policy',
  title: 'The sign-in policies admins saved',
  tables: ['sign_in_policy'],
  statements: ({ table, id }) => {
    const policy = table('sign_in_policy')
    const p = policy.columns
    return [
      ddl`create table ${policy} (
  id ${id} primary key,
  ${p.password} text not null,
  ${p.email_code} text not null,
  ${p.passkey} text not null,
  ${p.two_factor} text not null,
  ${p.staff_access} text not null,
  ${p.platform_sign_in} text not null,
  ${p.created_at} timestamptz not null,
  ${p.created_by} text
)`,
    ]
  },
}
