import { ddl } from '../../ddl'
import type { Step } from '../step'

/** The indexes staff sign-ins are found by: their session, and newest first. */
export const staffSignInIndexes: Step = {
  step: 2,
  name: 'staff_sign_in_indexes',
  version: 13,
  title: 'The indexes that find staff sign-ins',
  tables: [],
  statements: ({ table }) => {
    const staff = table('staff_sign_in')
    return [
      ddl`create index ${staff.index('staff_sign_in_session_id_idx')} on ${staff} (${staff.columns.session_id})`,
      ddl`create index ${staff.index('staff_sign_in_started_at_idx')} on ${staff} (${staff.columns.started_at} desc)`,
    ]
  },
}
