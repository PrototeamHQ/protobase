import { ddl } from '../../ddl'
import type { Step } from '../step'

/** The log of the operator's staff signing in as the app's people. */
export const staffSignIn: Step = {
  step: 1,
  version: 5,
  name: 'staff_sign_in',
  title: "The log of staff sign-ins as the app's people",
  tables: ['staff_sign_in'],
  statements: ({ table, id }) => {
    const log = table('staff_sign_in')
    const l = log.columns
    return [
      ddl`create table ${log} (
  id ${id} primary key,
  ${l.user_id} text not null,
  ${l.user_email} text not null,
  ${l.staff} text not null,
  ${l.staff_name} text,
  ${l.staff_subject} text not null,
  ${l.issuer} text not null,
  ${l.reason} text not null,
  ${l.session_id} text not null,
  ${l.started_at} timestamptz not null,
  ${l.expires_at} timestamptz not null,
  ${l.ended_at} timestamptz
)`,
    ]
  },
}
