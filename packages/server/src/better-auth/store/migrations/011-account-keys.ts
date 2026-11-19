import { ddl } from '../ddl'
import type { StoreMigration } from './migration'

/**
 * One account per provider and its account id, so two first sign-ins with the same account at once link it once; one
 * account per person of a provider that links one (`single_subject_user_id`, set for the platform's providers but
 * those of devices), so two first sign-ins with two subjects at once link one; the
 * device accounts people signed out of, which never sign in or link again; and the sessions each device account began,
 * which go with the session.
 */
export const accountKeys: StoreMigration = {
  version: 11,
  name: 'account_keys',
  title: 'One account per provider and account id, and per person where a provider links one, the device accounts people signed out of, and the sessions of each device',
  tables: ['refused_account', 'device_session'],
  statements: ({ table, user, id, idRef }) => {
    const account = table('account')
    const a = account.columns
    const refused = table('refused_account')
    const r = refused.columns
    const device = table('device_session')
    const d = device.columns
    return [
      ddl`create unique index ${account.index('account_provider_id_account_id_uidx')} on ${account} (${a.provider_id}, ${a.account_id})`,
      ddl`alter table ${account} add column ${a.single_subject_user_id} ${idRef}`,
      ddl`create unique index ${account.index('account_provider_id_single_subject_user_id_uidx')} on ${account} (${a.provider_id}, ${a.single_subject_user_id})`,
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
