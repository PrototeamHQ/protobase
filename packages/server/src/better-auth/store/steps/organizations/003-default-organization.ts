import { sql } from 'kysely'
import { generatedName } from '../../../names/identifier-length'
import { ddl } from '../../ddl'
import type { MigrationNames, OrganizationsInput, Step, StepInput } from '../step'

// The rows the pending tokens are filled in, per transaction.
const fillBatch = 10000

const settings = ({ organizations }: StepInput): OrganizationsInput => {
  if (!organizations) throw new Error('organizations.default is not set: give the config the organization that stands in while organizations are off, such as { id, name, slug }')
  return organizations
}

const defaultId = ({ idRef }: MigrationNames, input: StepInput) => ddl`cast(${sql.lit(settings(input).default.id)} as ${idRef})`

// The check that keeps the tokens' organization set while it is validated, named after their table.
const setCheckName = ({ table }: MigrationNames) => generatedName(`${table('personal_access_token').name}_organization_id_set`)

/**
 * The default organization, `organizations.default`, and every row of an organization in one. Its organization is
 * made when the store lacks it, under its id. When organizations turn on for the first time, every user there already
 * becomes its member with `organizations.existingUsersRole`, which a new store with its own user table, holding none,
 * does without, and every personal access token works in it; when they
 * were on before, a token without an organization has none to copy, so the step refuses, naming it, such as one made
 * while they were off before tokens made then were given the default organization as they were made. The tokens'
 * organization is then required: filled in batches, checked without a scan, and indexed concurrently, once the
 * migration's transaction commits.
 */
export const defaultOrganization: Step = {
  step: 3,
  name: 'default_organization',
  version: 18,
  title: 'The default organization, its members, and the organization of every personal access token',
  tables: [],
  check: ({ table, idRef }, input) => {
    const organization = table('organization')
    const o = organization.columns
    const { id, slug } = settings(input).default
    return ddl`do $check$
begin
  if exists (select from ${organization} where ${o.slug} = ${sql.lit(slug)} and id <> cast(${sql.lit(id)} as ${idRef})) then
    raise exception 'The auth store has an organization with the slug % under another id than the default organization''s, %: give organizations.default the id of that organization, or another slug.', ${sql.lit(slug)}, ${sql.lit(id)};
  end if;
end
$check$`
  },
  statements: (names, input) => {
    const { table, user, idRef } = names
    const organization = table('organization')
    const o = organization.columns
    const member = table('member')
    const m = member.columns
    const { default: { name, slug }, existingUsersRole } = settings(input)
    const id = defaultId(names, input)
    const made = ddl`insert into ${organization} (id, ${o.name}, ${o.slug}, ${o.created_at})
select ${id}, ${sql.lit(name)}, ${sql.lit(slug)}, now()
where not exists (select from ${organization} where id = ${id})`
    if (!input.firstOn || (!input.usersThere && existingUsersRole === undefined)) return [made]
    if (existingUsersRole === undefined) throw new Error('organizations.existingUsersRole is not set: name the app role every user there already holds in the default organization as organizations turn on')
    return [
      made,
      ddl`insert into ${member} (id, ${m.organization_id}, ${m.user_id}, ${m.role}, ${m.created_at}, ${m.app_roles})
select cast(pg_catalog.gen_random_uuid() as ${idRef}), ${id}, people.id, 'member', now(), jsonb_build_array(${sql.lit(existingUsersRole)})
from ${user} as people
where not exists (select from ${member} where ${m.organization_id} = ${id} and ${m.user_id} = people.id)`,
    ]
  },
  adds: {
    personal_access_tokens: (names) => {
      const token = names.table('personal_access_token')
      return [ddl`alter table ${token} add constraint ${sql.id(setCheckName(names))} check (${token.columns.organization_id} is not null) not valid`]
    },
  },
  addsChecks: {
    // Only where organizations were on before: tokens made then name theirs, as do those made while they were off, in the
    // default organization; the default is no source for one that names none.
    personal_access_tokens: ({ table }, input) => {
      const token = table('personal_access_token')
      const t = token.columns
      if (input.firstOn) return
      return ddl`do $check$
declare
  found text;
  total bigint;
begin
  select count(*) into total from ${token} where ${t.organization_id} is null;
  if total > 0 then
    select string_agg(id::text, ', ' order by id) into found from (select id from ${token} where ${t.organization_id} is null order by id limit 20) as listed;
    raise exception 'The auth store has % personal access tokens without an organization, which organizations were on for: %. Delete them, or set the organization each works in, in a migration of the project''s own written before this one, then apply again.', total, found;
  end if;
end
$check$`
    },
  },
  addsAfter: {
    personal_access_tokens: (names, input, concurrent) => {
      const token = names.table('personal_access_token')
      const t = token.columns
      const check = sql.id(setCheckName(names))
      const id = defaultId(names, input)
      const pending = ddl`select id from ${token} where ${t.organization_id} is null limit ${sql.lit(fillBatch)}`
      const fill = concurrent
        ? ddl`do $fill$
declare
  filled bigint;
begin
  loop
    update ${token} set ${t.organization_id} = ${id} where id in (${pending});
    get diagnostics filled = row_count;
    exit when filled = 0;
    commit;
  end loop;
end
$fill$`
        : ddl`update ${token} set ${t.organization_id} = ${id} where ${t.organization_id} is null`
      return [
        ...(input.firstOn ? [fill] : []),
        // Run again, as after a stopped run, once the check is gone and the column required, it does nothing.
        ddl`do $required$
begin
  if exists (select from pg_catalog.pg_constraint where conrelid = ${sql.lit(String(token))}::regclass and conname = ${sql.lit(setCheckName(names))}) then
    alter table ${token} validate constraint ${check};
    alter table ${token} alter column ${t.organization_id} set not null;
    alter table ${token} drop constraint ${check};
  end if;
end
$required$`,
        ddl`create index ${sql.raw(concurrent ? 'concurrently ' : '')}if not exists ${token.index('personal_access_token_organization_id_user_id_idx')} on ${token} (${t.organization_id}, ${t.user_id})`,
      ]
    },
  },
}
