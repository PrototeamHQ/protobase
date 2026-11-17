import { sql } from 'kysely'
import type { AdminAuth } from '../create-auth'
import { roleNames } from '../store/active-admin'
import { storeSqlOf } from '../store/store-sql'
import { findOrganizationByKey } from './host'
import { membershipRoles } from './role-definitions'
import type { AuthContext, OrganizationRole } from './store'

export type JoinedUser = { email: string; role: OrganizationRole; appRoles: string[] }

/**
 * Makes everyone with an account who is not a member yet a member of the organization, for an app that ran as one
 * organization, in one statement: superusers join as owners with every app role a member can hold and stay
 * superusers; everyone else joins as a member, their global roles a member can hold move onto the membership, and
 * their global role becomes `user`, since it would let them into every organization once there is a second. Answers
 * who joined, oldest first. It locks the organization's row first, as an accept of an invitation does, so two at once
 * take turns and the second sees every member the first made.
 */
export const addEveryUser = async (auth: AdminAuth, organizationKey: string): Promise<JoinedUser[]> => {
  if (!auth.organizations) throw new Error('Organizations are off: pass `organizations` to createAuth')
  const organization = await findOrganizationByKey(auth, organizationKey)
  const store = storeSqlOf((await auth.$context) as unknown as AuthContext)
  const holdable = membershipRoles(auth.organizations.definitions)
  const role = store.userColumn('role')
  const names = roleNames(sql`u.${role}`)
  const now = new Date()
  return store.db.transaction().execute(async (trx) => {
    await sql`select from ${store.table('organization')} where id = ${organization.id} for update`.execute(trx)
    const { rows } = await sql<JoinedUser>`with joined as (
      insert into ${store.table('member')} (id, organization_id, user_id, role, app_roles, created_at)
      select ${store.newId}, ${organization.id}, u.id,
        case when 'admin' = any(${names}) then 'owner' else 'member' end,
        case when 'admin' = any(${names}) then to_jsonb(${holdable}::text[])
          else coalesce((select jsonb_agg(name order by place) from unnest(${names}) with ordinality as held(name, place) where name = any(${holdable}::text[])), '[]'::jsonb) end,
        ${now}
      from ${store.user} u
      where not exists (select from ${store.table('member')} m where m.organization_id = ${organization.id} and m.user_id = u.id)
      returning user_id, role, app_roles
    ), demoted as (
      update ${store.user} u set ${role} = 'user', ${store.userColumn('updatedAt')} = ${now} from joined where u.id = joined.user_id and joined.role = 'member'
    )
    select u.${store.userColumn('email')} as email, joined.role, joined.app_roles as "appRoles" from joined
      join ${store.user} u on u.id = joined.user_id
      order by u.${store.userColumn('createdAt')}, u.id`.execute(trx)
    return rows
  })
}
