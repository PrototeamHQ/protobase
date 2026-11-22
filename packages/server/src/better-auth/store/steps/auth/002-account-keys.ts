import { ddl } from '../../ddl'
import type { Step } from '../step'

/**
 * One account per provider and its account id, so two first sign-ins with the same account at once link it once; and
 * one account per person of a provider that links one (`single_subject_user_id`, set for the platform's providers but
 * those of devices), so two first sign-ins with two subjects at once link one.
 */
export const accountKeys: Step = {
  step: 2,
  name: 'account_keys',
  version: 11,
  title: 'One account per provider and account id, and per person where a provider links one',
  tables: [],
  check: ({ table }) => {
    const account = table('account')
    const a = account.columns
    return ddl`do $check$
declare
  found text;
begin
  select string_agg(format('%s %s (accounts %s)', provider, subject, ids), '; ') into found
  from (
    select ${a.provider_id} as provider, ${a.account_id} as subject, string_agg(id::text, ', ' order by id) as ids
    from ${account} group by ${a.provider_id}, ${a.account_id} having count(*) > 1 order by 1, 2 limit 20
  ) as twice;
  if found is not null then
    raise exception 'The auth store has more than one account for a provider and account id: %. Keep one of each in a migration of the project''s own written before this one, then apply again.', found;
  end if;
end
$check$`
  },
  statements: ({ table, idRef }) => {
    const account = table('account')
    const a = account.columns
    return [
      ddl`create unique index ${account.index('account_provider_id_account_id_uidx')} on ${account} (${a.provider_id}, ${a.account_id})`,
      ddl`alter table ${account} add column ${a.single_subject_user_id} ${idRef}`,
      ddl`create unique index ${account.index('account_provider_id_single_subject_user_id_uidx')} on ${account} (${a.provider_id}, ${a.single_subject_user_id})`,
    ]
  },
}
