import { sql } from 'kysely'
import { ddl, ddlText } from '../../ddl'
import type { Step } from '../step'

// The scope a Gmail link holds to send mail, as the account rows keep it, comma- or space-separated.
const gmailSendScope = 'https://www.googleapis.com/auth/gmail.send'

/**
 * Each From address on the mailbox connection it goes out through, with what vouches for it: `typed_at` when its owner
 * typed it; `listed_at`, `provider_state` and `provider_state_read_at` from the provider's last complete listing of
 * the connection; `removed_at` when its owner removed it. `address_key` is the one spelling every writer matches on.
 * An address entered before goes on its owner's Gmail connection when they have exactly one; with none or several it
 * stays on none, and its owner adds it again.
 *
 * One address per connection takes the place of one per person, so the old key on the person and address goes: the
 * version before this one checks for an address entered twice in its own code, so nothing it does relies on the key.
 */
export const senderAddressEvidence: Step = {
  step: 3,
  version: 15,
  name: 'sender_address_evidence',
  title: 'The mailbox connection of each From address and what vouches for it',
  tables: [],
  check: ({ table }) => {
    const sender = table('mail_sender')
    const s = sender.columns
    return ddl`do $check$
declare
  found text;
begin
  select string_agg(ids, '; ') into found
  from (
    select string_agg(id::text, ', ' order by id) as ids from ${sender}
    group by ${s.user_id}, lower(btrim(${s.address})) having count(*) > 1 limit 20
  ) as twice;
  if found is not null then
    raise exception 'The auth store has From addresses entered twice by one person, without regard to case: %. Keep one of each in a migration of the project''s own written before this one, then apply again.', found;
  end if;
end
$check$`
  },
  statements: ({ table, idRef }) => {
    const sender = table('mail_sender')
    const s = sender.columns
    const account = table('account')
    const a = account.columns
    // The key step 001 made, by its columns: Postgres named it, and a long table name shortens that name.
    const quoted = (part: Parameters<typeof ddl>[1]) => sql.lit(ddlText(ddl`${part}`))
    const dropPersonKey = ddl`do $drop$
declare
  found text;
begin
  select con.conname into found from pg_constraint con
  where con.conrelid = ${quoted(sender)}::regclass and con.contype = 'u'
    and (select array_agg('"' || att.attname || '"' order by att.attname) from pg_attribute att where att.attrelid = con.conrelid and att.attnum = any(con.conkey))
      = (select array_agg(name order by name) from unnest(array[${quoted(s.user_id)}, ${quoted(s.address)}]) as name);
  if found is not null then
    execute format('alter table %s drop constraint %I', ${quoted(sender)}::regclass, found);
  end if;
end
$drop$`
    return [
      ddl`alter table ${sender} add column ${s.connection_id} ${idRef} references ${account} (id) on delete set null`,
      ddl`alter table ${sender} add column ${s.address_key} text generated always as (lower(btrim(${s.address}))) stored`,
      ddl`alter table ${sender} add column ${s.typed_at} timestamptz`,
      ddl`alter table ${sender} add column ${s.listed_at} timestamptz`,
      ddl`alter table ${sender} add column ${s.provider_state} text`,
      ddl`alter table ${sender} add column ${s.provider_state_read_at} timestamptz`,
      ddl`alter table ${sender} add column ${s.removed_at} timestamptz`,
      ddl`update ${sender} set ${s.typed_at} = ${s.created_at}`,
      ddl`update ${sender} set ${s.connection_id} = only_one.id
from (
  select ${a.user_id} as user_id, (array_agg(id))[1] as id from ${account}
  where ${a.provider_id} = 'google' and ${sql.lit(gmailSendScope)} = any(regexp_split_to_array(coalesce(${a.scope}, ''), ${sql.lit('[\\s,]+')}))
  group by ${a.user_id} having count(*) = 1
) as only_one
where ${sender}.${s.user_id} = only_one.user_id`,
      ddl`create unique index ${sender.index('mail_sender_connection_address_uidx')} on ${sender} (${s.connection_id}, ${s.address_key})`,
      ddl`create index ${sender.index('mail_sender_user_address_idx')} on ${sender} (${s.user_id}, ${s.address_key})`,
      dropPersonKey,
    ]
  },
}
