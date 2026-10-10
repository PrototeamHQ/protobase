import type { AdminAuth } from '../create-auth'
import { membershipRoles } from './role-definitions'
import { everyRow, findMember, membersOf, organizationRoleOf, setAppRoles, type AuthContext, type OrganizationRole, type StoredMember, type StoredOrganization } from './store'

// Host side only, like `createUser`: the CLI and scripts act as a superuser, so they may give any role. Storage goes
// through Better Auth's adapter. Written against better-auth 1.7.7.

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
  const { adapter } = await contextOf(auth)
  const found =
    (await adapter.findOne<StoredOrganization>({ model: 'organization', where: [{ field: 'id', value: key }] })) ??
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
  const owners = (await membersOf((await contextOf(auth)).adapter, member.organizationId)).filter((other) => organizationRoleOf(other) === 'owner')
  if (owners.length <= 1) throw new Error(`Cannot ${action} the last owner`)
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

/** Every organization, oldest first, with its members' emails and roles. */
export const listOrganizations = async (auth: AdminAuth) => {
  settingsOf(auth)
  const { adapter, internalAdapter } = await contextOf(auth)
  const organizations = await adapter.findMany<StoredOrganization>({ model: 'organization', sortBy: { field: 'createdAt', direction: 'asc' }, limit: everyRow })
  return Promise.all(
    organizations.map(async (organization) => ({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      members: await Promise.all(
        (await membersOf(adapter, organization.id)).map(async (member) => ({
          email: (await internalAdapter.findUserById(member.userId))?.email ?? member.userId,
          role: organizationRoleOf(member),
          appRoles: member.appRoles,
        })),
      ),
    })),
  )
}

/**
 * Makes `userId` the owner, with the creator's app roles, of every organization without members: for the first user of
 * an app whose organizations were made before anyone could own them, such as by its seed. Returns how many.
 */
export const ownOrganizationsWithoutMembers = async (auth: AdminAuth, userId: string) => {
  const settings = settingsOf(auth)
  const { adapter } = await contextOf(auth)
  const organizations = await adapter.findMany<StoredOrganization>({ model: 'organization', limit: everyRow })
  let owned = 0
  for (const organization of organizations) {
    if ((await membersOf(adapter, organization.id)).length > 0) continue
    await adapter.create({ model: 'member', data: { organizationId: organization.id, userId, role: 'owner', appRoles: settings.creatorAppRoles, createdAt: new Date() } })
    owned++
  }
  return owned
}

/** Gives an app role to every owner of every organization, for a role the project adds once organizations exist. */
export const addAppRoleToOwners = async (auth: AdminAuth, appRole: string) => {
  checkAppRoles(auth, [appRole])
  const { adapter } = await contextOf(auth)
  const owners = (await adapter.findMany<StoredMember & { appRoles?: unknown }>({ model: 'member', limit: everyRow })).filter((member) => organizationRoleOf(member) === 'owner')
  let changed = 0
  for (const owner of owners) {
    const current = (await findMember(adapter, { organizationId: owner.organizationId, userId: owner.userId }))!.appRoles
    if (current.includes(appRole)) continue
    await setAppRoles(adapter, owner.id, [...current, appRole])
    changed++
  }
  return changed
}
