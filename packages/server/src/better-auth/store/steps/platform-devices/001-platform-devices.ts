import { ddl } from '../../ddl'
import type { Step } from '../step'

/** The device accounts people signed out of, which never sign in or link again, and the sessions each device account began, which go with the session. */
export const platformDevices: Step = {
  step: 1,
  name: 'platform_devices',
  version: 11,
  title: 'The device accounts people signed out of, and the sessions of each device',
  tables: ['refused_account', 'device_session'],
  statements: ({ table, user, id, idRef }) => {
    const refused = table('refused_account')
    const r = refused.columns
    const device = table('device_session')
    const d = device.columns
    return [
      ddl`create table ${refused} (
  id ${id} primary key,
  ${r.provider_id} text not null,
  ${r.account_id} text not null,
  ${r.user_id} ${idRef} not null references ${user} (id) on delete cascade,
  ${r.created_at} timestamptz not null,
  unique (${r.provider_id}, ${r.account_id})
)`,
      ddl`create index ${refused.index('refused_account_user_id_idx')} on ${refused} (${r.user_id})`,
      ddl`create table ${device} (
  id ${id} primary key,
  ${d.session_id} ${idRef} not null unique references ${table('session')} (id) on delete cascade,
  ${d.account_id} text not null,
  ${d.created_at} timestamptz not null
)`,
      ddl`create index ${device.index('device_session_account_id_idx')} on ${device} (${d.account_id})`,
    ]
  },
}
