import { sql } from 'kysely'
import type { AdminAuth } from '../create-auth'
import { pageOf } from '../store/page-of'
import { mayBeId } from '../store/store-reads'
import { storeSqlOf } from '../store/store-sql'
import { parseAppRoles } from './app-roles'
import { membershipRoles } from './role-definitions'
import { findMember, isOwner, organizationRoleOf, setAppRoles, type AuthContext, type OrganizationRole, type StoredMember, type StoredOrganization } from './store'

// Host side only, like `createUser`: the CLI and scripts act as a superuser, so they may give any role. Storage goes
// through Better Auth's adapter, and a question about many rows goes to Postgres as one statement. Written against
// better-auth 1.7.7.

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

/** An organization by its id or slug. */
export const findOrganizationByKey = async (auth: AdminAuth, key: string) => {
  const context = await contextOf(auth)
  const { adapter } = context
  // Where the ids are uuids, a key that is none is a slug.
  const found =
    (mayBeId(context.options, key) ? await adapter.findOne<StoredOrganization>({ model: 'organization', where: [{ field: 'id', value: key }] }) : null) ??
    (await adapter.findOne<StoredOrganization>({ model: 'organization', where: [{ field: 'slug', value: key }] }))
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
  const { organization, member } = await adapter.transaction(async (trx) => {
    const organization = await trx.create<StoredOrganization & Record<string, unknown>, StoredOrganization>({
      model: 'organization',
      data: { id, name: input.name.trim(), slug: input.slug, createdAt: now },
      forceAllowId: true,
    })
    const member = await trx.create<Record<string, unknown>, StoredMember>({
      model: 'member',
      data: { organizationId: organization.id, userId: owner.id, role: 'owner', appRoles: settings.creatorAppRoles, createdAt: now },
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
  return adapter.create<Record<string, unknown>, StoredMember>({ model: 'member', data: { organizationId: organization.id, userId: user.id, role, appRoles, createdAt: new Date() } })
}

const memberOrThrow = async (auth: AdminAuth, organizationKey: string, email: string) => {
  const organization = await findOrganizationByKey(auth, organizationKey)
  const user = await userByEmail(auth, email)
  const member = await findMember((await contextOf(auth)).adapter, { organizationId: organization.id, userId: user.id })
  if (!member) throw new Error(`${email} is not a member of ${organization.slug}`)
  return { organization, member }
}

// An organization always keeps an owner, as Better Auth's own endpoints make sure of.
const refuseLastOwner = async (auth: AdminAuth, member: StoredMember, action: string) => {
  if (organizationRoleOf(member) !== 'owner') return
  const store = storeSqlOf(await contextOf(auth))
  const { rows } = await sql<{ found: boolean }>`select exists (select from ${store.table('member')}
    where organization_id = ${member.organizationId} and id <> ${member.id} and ${isOwner(sql`role`)}) as found`.execute(store.db)
  if (!rows[0]!.found) throw new Error(`Cannot ${action} the last owner`)
}

/** Changes a member's organization role, app roles, or both. */
export const setMemberRoles = async (auth: AdminAuth, input: MemberInput) => {
  const { member } = await memberOrThrow(auth, input.organization, input.email)
  const { adapter } = await contextOf(auth)
  if (input.role !== undefined) {
    const role = checkOrganizationRole(input.role)
    if (role !== 'owner') await refuseLastOwner(auth, member, 'demote')
    await adapter.update({ model: 'member', where: [{ field: 'id', value: member.id }], update: { role } })
  }
  if (input.appRoles !== undefined) await setAppRoles(adapter, member.id, checkAppRoles(auth, input.appRoles))
  return findMember(adapter, { organizationId: member.organizationId, userId: member.userId })
}

/** Removes a member; refuses the last owner. */
export const removeMember = async (auth: AdminAuth, input: { organization: string; email: string }) => {
  const { member } = await memberOrThrow(auth, input.organization, input.email)
  await refuseLastOwner(auth, member, 'remove')
  await (await contextOf(auth)).adapter.delete({ model: 'member', where: [{ field: 'id', value: member.id }] })
}

export type OrganizationsCursor = { createdAt: string; id: string }

export type ListedOrganization = { id: string; name: string; slug: string; members: { email: string; role: OrganizationRole; appRoles: string[] }[] }

/** The organizations a page holds, oldest first, and where the next page starts; no `next` on the last page. */
export type OrganizationsPage = { organizations: ListedOrganization[]; next?: OrganizationsCursor }

/** The organizations a page of `listOrganizations` holds when it is not told. */
export const organizationsPageSize = 100

/**
 * A page of the organizations, oldest first, each with its members' emails and roles, oldest member first: `size` of
 * them from `after`, the `next` of the page before, as Postgres pages them, and their members in one join.
 */
export const listOrganizations = async (auth: AdminAuth, { after, size = organizationsPageSize }: { after?: OrganizationsCursor; size?: number } = {}): Promise<OrganizationsPage> => {
  settingsOf(auth)
  const store = storeSqlOf(await contextOf(auth))
  const page = await pageOf<{ id: string; name: string; slug: string }>(store, {
    from: store.table('organization'),
    select: { id: sql`id`, name: sql`name`, slug: sql`slug` },
    key: [sql`created_at`, sql`id`],
    ...(after && { after: [after.createdAt, after.id] }),
    size,
  })
  const ids = page.rows.map((organization) => organization.id)
  const { rows: members } = await sql<{ organizationId: string; email: string; role: string; appRoles: unknown }>`select m.organization_id as "organizationId",
      coalesce(u.${store.userColumn('email')}, m.user_id::text) as email, m.role, m.app_roles as "appRoles"
    from ${store.table('member')} m left join ${store.user} u on u.id = m.user_id
    where m.organization_id = any(${ids}) order by m.created_at, m.id`.execute(store.db)
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
 * the first user of an app whose organizations were made before anyone could own them, such as by its seed. Returns
 * how many.
 */
export const ownOrganizationsWithoutMembers = async (auth: AdminAuth, userId: string) => {
  const settings = settingsOf(auth)
  const store = storeSqlOf(await contextOf(auth))
  const member = store.table('member')
  const { rows } = await sql`insert into ${member} (id, organization_id, user_id, role, app_roles, created_at)
    select ${store.newId}, o.id, ${userId}, 'owner', ${JSON.stringify(settings.creatorAppRoles)}::jsonb, ${new Date()} from ${store.table('organization')} o
    where not exists (select from ${member} m where m.organization_id = o.id)
    returning id`.execute(store.db)
  return rows.length
}

/**
 * Gives an app role to every owner of every organization who lacks it, in one statement, for a role the project adds
 * once organizations exist. Returns how many owners got it.
 */
export const addAppRoleToOwners = async (auth: AdminAuth, appRole: string) => {
  checkAppRoles(auth, [appRole])
  const store = storeSqlOf(await contextOf(auth))
  const held = sql`coalesce(app_roles, '[]'::jsonb)`
  const { rows } = await sql`update ${store.table('member')} set app_roles = ${held} || jsonb_build_array(${appRole}::text)
    where ${isOwner(sql`role`)} and not ${held} @> jsonb_build_array(${appRole}::text)
    returning id`.execute(store.db)
  return rows.length
}
