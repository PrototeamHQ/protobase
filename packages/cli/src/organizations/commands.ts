import { everyOrganization, type EveryOrganization, type Organization } from '@protobase/query'
import { pinLine, resolvePin, scopeOf, type PinOptions, type PinSource } from './pin'

// The host-side organization functions of @protobase/server, injected so the commands are testable. The host acts as a
// superuser: it may give any role, in the organization the command is pinned to (./pin.ts).
/** Where the next page of organizations starts: what the page before gave as `next`. */
export type OrganizationsCursor = { createdAt: string; id: string }

type ListedOrganization = { id: string; name: string; slug: string; members: { email: string; role: string; appRoles: string[] }[] }

/** The organization a host function works in, by its id, or every one. */
type Scope = Organization | EveryOrganization

export type OrganizationsApi = PinSource & {
  /** A page of the organizations in `scope`, oldest first, from the `next` of the page before; no `next` on the last page. */
  listOrganizations: (scope: Scope, after?: OrganizationsCursor) => Promise<{ organizations: ListedOrganization[]; next?: OrganizationsCursor }>
  createOrganization: (input: { name: string; slug: string; owner: string; id?: string }) => Promise<{ organization: { id: string; slug: string } }>
  addMember: (input: { organization: string; email: string; role?: string; appRoles?: string[] }) => Promise<unknown>
  setMemberRoles: (input: { organization: string; email: string; role?: string; appRoles?: string[] }) => Promise<unknown>
  removeMember: (input: { organization: string; email: string }) => Promise<void>
  addAppRoleToOwners: (scope: Scope, appRole: string) => Promise<number>
  /** Makes every user who is not a member yet a member, as `organizations create --members all` describes. */
  addEveryUser: (organization: string) => Promise<{ email: string; role: string; appRoles: string[] }[]>
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

export const listOrganizationsCommand = async (api: OrganizationsApi, options: PinOptions, out: Out) => {
  const pin = await resolvePin(api, options, 'organizations list', () => everyOrganization('protobase organizations list: --all-organizations'))
  out(pinLine(pin))
  let page = await api.listOrganizations(scopeOf(pin))
  if (page.organizations.length === 0) {
    out('No organizations yet. Create one with: protobase organizations create "Acme" --owner you@example.com\n')
    return
  }
  for (;;) {
    for (const organization of page.organizations) {
      out(`${organization.slug}  ${organization.name}  (${organization.id})\n`)
      for (const member of organization.members) out(`  ${member.email}  ${member.role}${member.appRoles.length > 0 ? `  ${member.appRoles.join(',')}` : ''}\n`)
    }
    if (!page.next) return
    page = await api.listOrganizations(scopeOf(pin), page.next)
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
  for (const user of await api.addEveryUser(organization.id)) {
    if (user.role === 'owner') out(`  ${user.email}: owner, with every app role\n`)
    else out(`  ${user.email}: member${user.appRoles.length > 0 ? `, with ${user.appRoles.join(',')}` : ''}\n`)
  }
}

export type MemberOptions = PinOptions & { email: string; orgRole?: string; appRoles?: string }

// A membership is in one organization: the pinned one.
const memberPin = async (api: OrganizationsApi, options: PinOptions, command: string) => {
  const pin = await resolvePin(api, options, command)
  if ('every' in pin) throw new Error(`protobase ${command} acts on one organization`)
  return pin.organization
}

export const addMemberCommand = async (api: OrganizationsApi, options: MemberOptions, out: Out) => {
  const appRoles = parseRoleList(options.appRoles)
  const organization = await memberPin(api, options, 'organizations add-member')
  await api.addMember({ organization: organization.id, email: options.email, ...(options.orgRole && { role: options.orgRole }), ...(appRoles && { appRoles }) })
  out(`Added ${options.email} to ${organization.slug}\n`)
}

export const setMemberRolesCommand = async (api: OrganizationsApi, options: MemberOptions, out: Out) => {
  const appRoles = parseRoleList(options.appRoles)
  if (options.orgRole === undefined && appRoles === undefined) throw new Error('Pass --org-role, --app-roles or both')
  const organization = await memberPin(api, options, 'organizations set-roles')
  await api.setMemberRoles({ organization: organization.id, email: options.email, ...(options.orgRole && { role: options.orgRole }), ...(appRoles && { appRoles }) })
  out(`Changed the roles of ${options.email} in ${organization.slug}\n`)
}

export const removeMemberCommand = async (api: OrganizationsApi, options: PinOptions & { email: string }, out: Out) => {
  const organization = await memberPin(api, options, 'organizations remove-member')
  await api.removeMember({ organization: organization.id, email: options.email })
  out(`Removed ${options.email} from ${organization.slug}\n`)
}

export const addAppRoleCommand = async (api: OrganizationsApi, options: PinOptions & { role: string; to: string }, out: Out) => {
  if (options.to !== 'owners') throw new Error(`--to takes "owners", not "${options.to}"`)
  const pin = await resolvePin(api, options, 'organizations add-app-role', () => everyOrganization('protobase organizations add-app-role: --all-organizations'))
  out(pinLine(pin))
  const changed = await api.addAppRoleToOwners(scopeOf(pin), options.role)
  out(`Gave ${options.role} to ${changed} owner${changed === 1 ? '' : 's'}\n`)
}
