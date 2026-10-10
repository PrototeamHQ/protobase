// The host-side organization functions of @protobase/server, injected so the commands are testable. The host acts as a
// superuser: it may give any role.
export type OrganizationsApi = {
  listOrganizations: () => Promise<{ id: string; name: string; slug: string; members: { email: string; role: string; appRoles: string[] }[] }[]>
  createOrganization: (input: { name: string; slug: string; owner: string; id?: string }) => Promise<{ organization: { id: string; slug: string } }>
  addMember: (input: { organization: string; email: string; role?: string; appRoles?: string[] }) => Promise<unknown>
  setMemberRoles: (input: { organization: string; email: string; role?: string; appRoles?: string[] }) => Promise<unknown>
  removeMember: (input: { organization: string; email: string }) => Promise<void>
  addAppRoleToOwners: (appRole: string) => Promise<number>
  listUsers: () => Promise<{ email: string; role: string }[]>
  setUserRole: (input: { email: string; role: string }) => Promise<unknown>
  /** The roles a member can hold. */
  membershipRoles: () => string[]
}

type Out = (text: string) => void

/** A slug from a name: lowercase ASCII words joined by dashes; diacritics are dropped, so Müller becomes muller. */
export const slugOf = (name: string) =>
  name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63)

/** `a,b` as a list of roles; an empty text is none. */
export const parseRoleList = (text: string | undefined) => (text === undefined ? undefined : text.split(',').map((name) => name.trim()).filter(Boolean))

export const listOrganizationsCommand = async (api: OrganizationsApi, out: Out) => {
  const organizations = await api.listOrganizations()
  if (organizations.length === 0) {
    out('No organizations yet. Create one with: protobase organizations create "Acme" --owner you@example.com\n')
    return
  }
  for (const organization of organizations) {
    out(`${organization.slug}  ${organization.name}  (${organization.id})\n`)
    for (const member of organization.members) out(`  ${member.email}  ${member.role}${member.appRoles.length > 0 ? `  ${member.appRoles.join(',')}` : ''}\n`)
  }
}

export type CreateOrganizationOptions = {
  name: string
  owner: string
  slug?: string
  /** Keep an existing tenant value, for an app that ran as one organization before. */
  id?: string
  /** `all`: every other user joins too, superusers as owners and the others with their global roles moved here. */
  members?: string
}

/**
 * Creates an organization owned by `owner`. With `--members all`, for an app that ran as one organization: superusers
 * join as owners with every app role and stay superusers; everyone else joins as a member, and their global roles move
 * onto the membership, since a global role would let them into every organization once there is a second.
 */
export const createOrganizationCommand = async (api: OrganizationsApi, options: CreateOrganizationOptions, out: Out) => {
  if (options.members !== undefined && options.members !== 'all') throw new Error(`--members takes "all", not "${options.members}"`)
  const slug = options.slug ?? slugOf(options.name)
  const { organization } = await api.createOrganization({ name: options.name, slug, owner: options.owner, ...(options.id && { id: options.id }) })
  out(`Created organization ${organization.slug} (${organization.id}), owned by ${options.owner}\n`)
  if (options.members !== 'all') return
  const holdable = api.membershipRoles()
  for (const user of await api.listUsers()) {
    if (user.email.toLowerCase() === options.owner.toLowerCase()) continue
    const global = user.role.split(',').map((name) => name.trim()).filter(Boolean)
    if (global.includes('admin')) {
      await api.addMember({ organization: organization.id, email: user.email, role: 'owner', appRoles: holdable })
      out(`  ${user.email}: owner, with every app role\n`)
      continue
    }
    const appRoles = global.filter((name) => holdable.includes(name))
    await api.addMember({ organization: organization.id, email: user.email, role: 'member', appRoles })
    await api.setUserRole({ email: user.email, role: 'user' })
    out(`  ${user.email}: member${appRoles.length > 0 ? `, with ${appRoles.join(',')}` : ''}\n`)
  }
}

export type MemberOptions = { organization: string; email: string; orgRole?: string; appRoles?: string }

export const addMemberCommand = async (api: OrganizationsApi, options: MemberOptions, out: Out) => {
  const appRoles = parseRoleList(options.appRoles)
  await api.addMember({ organization: options.organization, email: options.email, ...(options.orgRole && { role: options.orgRole }), ...(appRoles && { appRoles }) })
  out(`Added ${options.email} to ${options.organization}\n`)
}

export const setMemberRolesCommand = async (api: OrganizationsApi, options: MemberOptions, out: Out) => {
  const appRoles = parseRoleList(options.appRoles)
  if (options.orgRole === undefined && appRoles === undefined) throw new Error('Pass --org-role, --app-roles or both')
  await api.setMemberRoles({ organization: options.organization, email: options.email, ...(options.orgRole && { role: options.orgRole }), ...(appRoles && { appRoles }) })
  out(`Changed the roles of ${options.email} in ${options.organization}\n`)
}

export const removeMemberCommand = async (api: OrganizationsApi, options: { organization: string; email: string }, out: Out) => {
  await api.removeMember(options)
  out(`Removed ${options.email} from ${options.organization}\n`)
}

export const addAppRoleCommand = async (api: OrganizationsApi, options: { role: string; to: string }, out: Out) => {
  if (options.to !== 'owners') throw new Error(`--to takes "owners", not "${options.to}"`)
  const changed = await api.addAppRoleToOwners(options.role)
  out(`Gave ${options.role} to ${changed} owner${changed === 1 ? '' : 's'}\n`)
}
