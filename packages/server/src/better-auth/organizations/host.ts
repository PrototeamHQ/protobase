import { isEveryOrganization } from '@protobase/query'
import { sql } from 'kysely'
import type { AdminAuth } from '../create-auth'
import { pageOf } from '../store/page-of'
import { mayBeId } from '../store/store-reads'
import { storeSqlOf } from '../store/store-sql'
import { acrossOrganizations, inOrganization, inSignInScope } from '../../organization-scope/sign-in-organization'
import { parseAppRoles } from './app-roles'
import { builderName, rowsIn, type HostScope } from './host-scope'
import { notDefaultOrganization } from './not-default'
import { membershipRoles } from './role-definitions'
import { findMember, isOwner, organizationRoleOf, setAppRoles, type AuthContext, type OrganizationRole, type StoredMember, type StoredOrganization } from './store'

// Host side only, like `createUser`: the CLI and scripts act as a superuser, so they may give any role. Each function
// works in the organization it is about, or in the `HostScope` its caller gives; the `organization` table itself
// belongs to none. Storage goes through Better Auth's adapter, and a question about many rows goes to Postgres as one
// statement. Written against better-auth 1.7.7.

// The instance's context is typed by its own options; the store functions take the context of any instance.
const contextOf = async (auth: AdminAuth) => (await auth.$context) as unknown as AuthContext

const settingsOf = (auth: AdminAuth) => {
  if (!auth.organizations) throw new Error('Organizations are off: pass `organizations` to createAuth')
  return auth.organizations
}

const organizationRoles: OrganizationRole[] = ['owner', 'admin', 'member']

const checkOrganizationRole = (role: string): OrganizationRole => {
  if (!(organizationRoles as string[]).includes(role)) throw new Error(`Unknown organization role "${role}"; use ${organizationRoles.join(', ')}`)
  return role as OrganizationRole
}

const checkAppRoles = (auth: AdminAuth, appRoles: readonly string[]) => {
  const holdable = membershipRoles(settingsOf(auth).definitions)
  const unknown = appRoles.find((name) => !holdable.includes(name))
  if (unknown !== undefined) throw new Error(`A member cannot hold "${unknown}"; use ${holdable.join(', ')}`)
  return [...new Set(appRoles)]
}

const userByEmail = async (auth: AdminAuth, email: string) => {
  const user = await (await contextOf(auth)).internalAdapter.findUserByEmail(email.toLowerCase())
  if (!user) throw new Error(`No user with email ${email}`)
  return user.user
}

/** An organization by its id or slug; null when there is none. */
export const organizationByKey = async (auth: AdminAuth, key: string) => {
  const context = await contextOf(auth)
  const { adapter } = context
  // Where the ids are uuids, a key that is none is a slug.
  return (
    (mayBeId(context.options, key) ? await adapter.findOne<StoredOrganization>({ model: 'organization', where: [{ field: 'id', value: key }] }) : null) ??
    (await adapter.findOne<StoredOrganization>({ model: 'organization', where: [{ field: 'slug', value: key }] }))
  )
}

/** An organization by its id or slug; refused when there is none. */
export const findOrganizationByKey = async (auth: AdminAuth, key: string) => {
  const found = await organizationByKey(auth, key)
  if (!found) throw new Error(`No organization "${key}"`)
  return found
}

const slugPattern = /^[a-z0-9][a-z0-9-]{0,62}$/

export type NewOrganization = { name: string; slug: string; owner: string; id?: string }

/**
 * Creates an organization with `owner` (an email) as its owner, holding the creator's app roles. `id` keeps an existing
 * tenant value, for an app that had one organization before; otherwise the configured `generateId` makes one.
 */
export const createOrganization = async (auth: AdminAuth, input: NewOrganization) => {
  const settings = settingsOf(auth)
  if (!input.name.trim()) throw new Error('The organization needs a name')
  if (!slugPattern.test(input.slug)) throw new Error(`Invalid slug "${input.slug}": lowercase letters, digits and "-", at most 63`)
  const owner = await userByEmail(auth, input.owner)
  const { adapter } = await contextOf(auth)
  if (await adapter.findOne({ model: 'organization', where: [{ field: 'slug', value: input.slug }] })) throw new Error(`An organization with slug "${input.slug}" exists already`)
  const now = new Date()
  const id = input.id ?? (await settings.generateId())
  return inOrganization(id, () => createWithOwner(auth, { id, name: input.name.trim(), slug: input.slug, owner: owner.id, createdAt: now }))
}

// The organization and its owner's membership, in the organization's scope.
const createWithOwner = async (auth: AdminAuth, { id, name, slug, owner, createdAt }: { id: string; name: string; slug: string; owner: string; createdAt: Date }) => {
  const settings = settingsOf(auth)
  const { adapter } = await contextOf(auth)
  const { organization, member } = await adapter.transaction(async (trx) => {
    const organization = await trx.create<StoredOrganization & Record<string, unknown>, StoredOrganization>({
      model: 'organization',
      data: { id, name, slug, createdAt },
      forceAllowId: true,
    })
    const member = await trx.create<Record<string, unknown>, StoredMember>({
      model: 'member',
      data: { organizationId: organization.id, userId: owner, role: 'owner', appRoles: settings.creatorAppRoles, createdAt },
    })
    return { organization, member }
  })
  const stored = { ...member, appRoles: [...settings.creatorAppRoles] }
  await settings.options.onCreated?.({ organization, member: stored })
  return { organization, member: stored }
}

export type MemberInput = { organization: string; email: string; role?: string; appRoles?: string[] }

/** Adds someone with an account as a member: organization role `member` unless given, and the app roles given. */
export const addMember = async (auth: AdminAuth, input: MemberInput) => {
  const organization = await findOrganizationByKey(auth, input.organization)
  const user = await userByEmail(auth, input.email)
  const { adapter } = await contextOf(auth)
  if (await findMember(adapter, { organizationId: organization.id, userId: user.id })) throw new Error(`${input.email} is a member of ${organization.slug} already`)
  const role = checkOrganizationRole(input.role ?? 'member')
  const appRoles = checkAppRoles(auth, input.appRoles ?? [])
  const data = { organizationId: organization.id, userId: user.id, role, appRoles, createdAt: new Date() }
  return inOrganization(organization.id, () => adapter.create<Record<string, unknown>, StoredMember>({ model: 'member', data }))
}

/** Whether someone with `email` has an account and is a member of the organization with id `organizationId`. */
export const isMemberByEmail = async (auth: AdminAuth, organizationId: string, email: string) => {
  const { adapter, internalAdapter } = await contextOf(auth)
  const found = await internalAdapter.findUserByEmail(email.toLowerCase())
  if (!found) return false
  return (await findMember(adapter, { organizationId, userId: found.user.id })) !== undefined
}

/** The membership of the user with `email` in the organization with id or slug `organizationKey`; refused when there is none. */
const requireMember = async (auth: AdminAuth, organizationKey: string, email: string) => {
  const organization = await findOrganizationByKey(auth, organizationKey)
  const user = await userByEmail(auth, email)
  const member = await findMember((await contextOf(auth)).adapter, { organizationId: organization.id, userId: user.id })
  if (!member) throw new Error(`${email} is not a member of ${organization.slug}`)
  return { organization, member }
}

// An organization always keeps an owner, as Better Auth's own endpoints make sure of.
// Runs in the member's organization.
const refuseLastOwner = async (auth: AdminAuth, member: StoredMember, action: string) => {
  if (organizationRoleOf(member) !== 'owner') return
  const store = storeSqlOf(await contextOf(auth))
  const members = store.table('member')
  const { role } = members.columns
  const { rows } = await sql<{ found: boolean }>`select exists (select from ${rowsIn(store, member.organizationId, members)} as m
    where id <> ${member.id} and ${isOwner(sql`m.${role}`)}) as found`.execute(store.db)
  if (!rows[0]!.found) throw new Error(`Cannot ${action} the last owner`)
}

/** Changes a member's organization role, app roles, or both. */
export const setMemberRoles = async (auth: AdminAuth, input: MemberInput) => {
  const { member } = await requireMember(auth, input.organization, input.email)
  const { adapter } = await contextOf(auth)
  return inOrganization(member.organizationId, async () => {
    if (input.role !== undefined) {
      const role = checkOrganizationRole(input.role)
      if (role !== 'owner') await refuseLastOwner(auth, member, 'demote')
      await adapter.update({ model: 'member', where: [{ field: 'id', value: member.id }], update: { role } })
    }
    if (input.appRoles !== undefined) await setAppRoles(adapter, member, checkAppRoles(auth, input.appRoles))
    return findMember(adapter, { organizationId: member.organizationId, userId: member.userId })
  })
}

/** Removes a member; refuses the last owner. */
export const removeMember = async (auth: AdminAuth, input: { organization: string; email: string }) => {
  const { member } = await requireMember(auth, input.organization, input.email)
  const { adapter } = await contextOf(auth)
  await inOrganization(member.organizationId, async () => {
    await refuseLastOwner(auth, member, 'remove')
    await adapter.delete({ model: 'member', where: [{ field: 'id', value: member.id }] })
  })
}

export type OrganizationsCursor = { createdAt: string; id: string }

export type ListedOrganization = { id: string; name: string; slug: string; members: { email: string; role: OrganizationRole; appRoles: string[] }[] }

/** The organizations a page holds, oldest first, and where the next page starts; no `next` on the last page. */
export type OrganizationsPage = { organizations: ListedOrganization[]; next?: OrganizationsCursor }

/** The organizations a page of `listOrganizations` holds when it is not told. */
export const organizationsPageSize = 100

/**
 * A page of the organizations `scope` holds, oldest first, each with its members' emails and roles, oldest member
 * first: `size` of them from `after`, the `next` of the page before, as Postgres pages them, and their members in one
 * join.
 */
export const listOrganizations = (auth: AdminAuth, scope: HostScope, page: { after?: OrganizationsCursor; size?: number } = {}) =>
  inSignInScope(scope, () => organizationsPage(auth, scope, page))

const organizationsPage = async (auth: AdminAuth, scope: HostScope, { after, size = organizationsPageSize }: { after?: OrganizationsCursor; size?: number }): Promise<OrganizationsPage> => {
  settingsOf(auth)
  const store = storeSqlOf(await contextOf(auth))
  const organization = store.table('organization')
  const o = organization.columns
  // The `organization` table belongs to no organization, so one organization's page names it.
  const from = isEveryOrganization(scope) ? organization : sql`(select * from ${organization} where id = ${scope}) as o`
  const page = await pageOf<{ id: string; name: string; slug: string }>(store, {
    from,
    select: { id: sql`id`, name: o.name, slug: o.slug },
    key: [o.created_at, sql`id`],
    ...(after && { after: [after.createdAt, after.id] }),
    size,
  })
  const ids = page.rows.map((organization) => organization.id)
  const user = store.table('user')
  const m = store.table('member').columns
  const { rows: members } = await sql<{ organizationId: string; email: string; role: string; appRoles: unknown }>`select m.${m.organization_id} as "organizationId",
      coalesce(u.${user.columns.email}, m.${m.user_id}::text) as email, m.${m.role} as role, m.${m.app_roles} as "appRoles"
    from ${rowsIn(store, scope, store.table('member'))} as m left join ${user} u on u.id = m.${m.user_id}
    where m.${m.organization_id} = any(${ids}) order by m.${m.organization_id}, m.${m.created_at}, m.id`.execute(store.db)
  const membersOf = new Map<string, typeof members>()
  for (const member of members) {
    const held = membersOf.get(member.organizationId)
    if (held) held.push(member)
    else membersOf.set(member.organizationId, [member])
  }
  const organizations = page.rows.map(({ id, name, slug }) => ({
    id,
    name,
    slug,
    members: (membersOf.get(id) ?? []).map((member) => ({ email: member.email, role: organizationRoleOf(member), appRoles: parseAppRoles(member.appRoles) })),
  }))
  return { organizations, ...(page.next && { next: { createdAt: page.next[0]!, id: page.next[1]! } }) }
}

/**
 * Makes `userId` the owner, with the creator's app roles, of every organization without members, in one statement: for
 * the first user of an app whose organizations were made before anyone could own them, such as by its seed. The
 * default organization is left out: the migration made it to stand in while organizations are off. Returns how many.
 */
export const ownOrganizationsWithoutMembers = (auth: AdminAuth, userId: string) =>
  acrossOrganizations('the first user owns every organization without members', () => ownEmptyOrganizations(auth, userId))

const ownEmptyOrganizations = async (auth: AdminAuth, userId: string) => {
  const settings = settingsOf(auth)
  const context = await contextOf(auth)
  const store = storeSqlOf(context)
  const member = store.table('member')
  const m = member.columns
  const notDefault = notDefaultOrganization(context.options, settings.options.default?.id)
  const { rows } = await sql`insert into ${member} (id, ${m.organization_id}, ${m.user_id}, ${m.role}, ${m.app_roles}, ${m.created_at})
    select ${store.newId}, o.id, ${userId}, 'owner', ${JSON.stringify(settings.creatorAppRoles)}::jsonb, ${new Date()} from ${store.table('organization')} o
    where not exists (select from ${member} m where m.${m.organization_id} = o.id) ${notDefault}
    returning id`.execute(store.db)
  return rows.length
}

/**
 * Gives an app role to every owner in `scope` who lacks it, in one statement, for a role the project adds once
 * organizations exist. Returns how many owners got it.
 */
export const addAppRoleToOwners = (auth: AdminAuth, scope: HostScope, appRole: string) => inSignInScope(scope, () => giveOwnersAppRole(auth, scope, appRole))

// Kysely's builder writes the update, so a store kept to the organization (`ScopedDb`) checks it too.
const giveOwnersAppRole = async (auth: AdminAuth, scope: HostScope, appRole: string) => {
  checkAppRoles(auth, [appRole])
  const store = storeSqlOf(await contextOf(auth))
  const member = store.table('member')
  const { app_roles, organization_id, role } = member.columns
  const held = sql`coalesce(${app_roles}, '[]'::jsonb)`
  const update = store.db
    .updateTable(builderName(member))
    .set({ [app_roles.name]: sql`${held} || jsonb_build_array(${appRole}::text)` })
    .where(sql<boolean>`${isOwner(sql`${role}`)} and not ${held} @> jsonb_build_array(${appRole}::text)`)
  const kept = isEveryOrganization(scope) ? update : update.where(organization_id.name, '=', scope)
  const rows = await kept.returning('id').execute()
  return rows.length
}
