import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { quoteIdent } from '../changes/capture-sql'
import { jobsSchema } from '../jobs/schema'
import { relaySchema } from './sessions-sql'

/** The job a change of who is in an organization queues, which moves them in or out of its organization-wide channels. */
export const organizationMembersJob = 'relay.organization-members'

/** Bumped whenever the objects below change, so the next migration writes them again. */
export const organizationMembersVersion = 1

/** The auth store's member table by the SQL names the trigger reads: the table as SQL names it, and its columns. */
export type MemberTable = { table: string; organization: string; user: string }

/** The triggers on the member table: one each for inserts, updates and deletes, as a trigger with transition tables takes one event. */
export const memberTriggers = { insert: 'relay_member_added', update: 'relay_member_moved', delete: 'relay_member_removed' } as const

const functionName = `${relaySchema}.organization_members_changed()`

/**
 * The function's comment: its version and the member table's columns its body reads, so a function written for other
 * column names reads as one to write again.
 */
export const memberFunctionComment = ({ organization, user }: Pick<MemberTable, 'organization' | 'user'>) => `Protobase relay organization members ${organizationMembersVersion}: ${organization}, ${user}`

const literal = (text: string) => `'${text.replaceAll("'", "''")}'`

/**
 * The function and triggers that queue one `relay.organization-members` job for each statement that changes who is in
 * an organization, in its transaction, with each `{ organization, user }` it puts in or takes out, whatever wrote it:
 * an invitation accepted, a member removed, an organization or user deleted, or SQL. An update queues only the pairs
 * it changes, so a new role queues nothing. The job reads who is a member as it stands, so a pair names only whom to
 * look at again.
 */
export const memberTableSql = (member: MemberTable) => {
  const { table, organization, user } = member
  const pairs = (from: string) => `select ${quoteIdent(organization)}::text as organization, ${quoteIdent(user)}::text as "user" from ${from}`
  const aggregate = (from: string) => `select jsonb_agg(distinct jsonb_build_object('organization', p.organization, 'user', p."user")) into moved from (${from}) as p`
  return [
    `create schema if not exists ${relaySchema}`,
    `create or replace function ${functionName} returns trigger
language plpgsql as $$
declare
  moved jsonb;
begin
  if tg_op = 'INSERT' then
    ${aggregate(pairs('added'))};
  elsif tg_op = 'DELETE' then
    ${aggregate(pairs('removed'))};
  else
    ${aggregate(`(${pairs('added')} except ${pairs('removed')}) union (${pairs('removed')} except ${pairs('added')})`)};
  end if;
  if moved is not null then
    perform ${jobsSchema}.enqueue('${organizationMembersJob}', jsonb_build_object('members', moved));
  end if;
  return null;
end
$$`,
    `comment on function ${functionName} is ${literal(memberFunctionComment(member))}`,
    ...Object.values(memberTriggers).map((name) => `drop trigger if exists ${name} on ${table}`),
    `create trigger ${memberTriggers.insert} after insert on ${table} referencing new table as added for each statement execute function ${functionName}`,
    `create trigger ${memberTriggers.update} after update on ${table} referencing old table as removed new table as added for each statement execute function ${functionName}`,
    `create trigger ${memberTriggers.delete} after delete on ${table} referencing old table as removed for each statement execute function ${functionName}`,
  ]
}

/** Drops the triggers from the member table, then the function once no trigger calls it. */
export const dropMemberTableSql = (table: string) => [...Object.values(memberTriggers).map((name) => `drop trigger if exists ${name} on ${table}`), `drop function if exists ${functionName}`]

/**
 * The tables the triggers stand on, by schema and name, each with whether all three are there and fire (`complete`),
 * and the comment of the function they call, which `memberFunctionComment` writes. Only reads the catalogue.
 */
export const memberTriggersFound = async (db: Db) =>
  (
    await sql<{ schema: string; name: string; table: string; complete: boolean; comment: string | null }>`select n.nspname as schema, c.relname as name, c.oid::regclass::text as "table",
        count(distinct t.tgname) = ${Object.keys(memberTriggers).length} and bool_and(t.tgenabled in ('O', 'A')) as complete,
        max(obj_description(p.oid, 'pg_proc')) as comment
      from pg_trigger t join pg_proc p on p.oid = t.tgfoid join pg_namespace pn on pn.oid = p.pronamespace
      join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
      where pn.nspname = ${relaySchema} and p.proname = 'organization_members_changed' and t.tgname = any(${Object.values(memberTriggers)}::text[])
      group by n.nspname, c.relname, c.oid`.execute(db)
  ).rows
