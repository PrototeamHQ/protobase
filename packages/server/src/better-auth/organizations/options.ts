import type { OrganizationOptions } from 'better-auth/plugins/organization'
import { membershipRoles, type RoleDefinitions } from './role-definitions'
import type { StoredMember, StoredOrganization } from './store'

type OrganizationHooks = NonNullable<OrganizationOptions['organizationHooks']>

/** The app's word for an organization, as a view's `names` are written: capitalised, in the app's language. */
export type OrganizationNames = { singular: string; plural: string }

/** The organization a store's rows belong to while organizations are off, and the first one when they turn on. */
export type DefaultOrganization = { id: string; name: string; slug: string }

export type OrganizationsOptions = {
  /**
   * The organization that stands in for every organization while they are off, which `protobase migration` makes when
   * they turn on and gives the rows of an organization that were there already. Required once they were ever on.
   */
  default?: DefaultOrganization
  /** The app role each user there already holds in `default` when organizations turn on the first time. */
  existingUsersRole?: string
  /** The app roles an organization's creator holds there: `'all'` (default), every role a member can hold, or a list. */
  creatorAppRoles?: 'all' | string[]
  /** Who may create organizations: `'admins'` (default), superusers only, or `'everyone'` signed in. */
  create?: 'admins' | 'everyone'
  /** What the app calls an organization, such as `{ singular: 'Workspace', plural: 'Workspaces' }`. Default the built-in "Organization". */
  names?: OrganizationNames
  /** A line under the title of the screen where someone names their first organization, such as what one is for. */
  createDescription?: string
  /** How long an invitation works, in days. Default 7. */
  invitationDays?: number
  /** The most members an organization can have. Default 1000. */
  membershipLimit?: number
  /**
   * The id of a new organization. Default `crypto.randomUUID()`. `.tenant` columns hold it: `text` or `uuid` for the
   * default, or an integer column when this takes the next value of the app's own organizations sequence.
   */
  generateId?: () => string | Promise<string>
  /**
   * What deleting an organization does with its records: `'refuse'` (default) deletes only an organization without
   * rows in any `.tenant` resource; `'cascade'` leaves it to the project's foreign keys.
   */
  deleteRecords?: 'refuse' | 'cascade'
  /** The page an invitation link opens, with `?token=`. Default `/-/invitation` on the origin the request came to. */
  invitationUrl?: string
  /** Runs after an organization is created, with its owner's membership, for example to add the app's own row for it. */
  onCreated?: (input: { organization: StoredOrganization; member: StoredMember }) => Promise<void>
  /** Runs before an organization is deleted; throwing refuses the deletion. */
  beforeDelete?: (organization: StoredOrganization) => Promise<void>
  /** Better Auth's organization hooks, run after Protobase's own. */
  hooks?: OrganizationHooks
}

export type ResolvedOrganizations = {
  definitions: RoleDefinitions
  creatorAppRoles: string[]
  create: 'admins' | 'everyone'
  invitationExpiresIn: number
  membershipLimit: number
  generateId: () => string | Promise<string>
  deleteRecords: 'refuse' | 'cascade'
  invitationUrl?: string
  options: OrganizationsOptions
}

/** Whether the config's `auth.organizations` turns organizations on; refuses another shape, such as `true`. */
export const organizationsEnabled = (organizations: unknown) => {
  if (organizations === undefined) return false
  const enabled = typeof organizations === 'object' && organizations !== null ? (organizations as { enabled?: unknown }).enabled : undefined
  if (typeof enabled !== 'boolean') throw new Error("auth.organizations takes { enabled: true, default: { id, name, slug }, existingUsersRole }; set enabled: false to turn them off")
  return enabled
}

/** Refuses a default organization without its id, name or slug. */
export const checkDefaultOrganization = (organization: DefaultOrganization) => {
  const missing = (['id', 'name', 'slug'] as const).filter((key) => typeof organization[key] !== 'string' || organization[key].trim() === '')
  if (missing.length > 0) throw new Error(`organizations.default needs ${missing.join(', ')}, such as { id: 'main', name: 'Main', slug: 'main' }`)
}

export const resolveOrganizations = (options: OrganizationsOptions, definitions: RoleDefinitions): ResolvedOrganizations => {
  const holdable = membershipRoles(definitions)
  const creatorAppRoles = options.creatorAppRoles === undefined || options.creatorAppRoles === 'all' ? holdable : options.creatorAppRoles
  const unknown = creatorAppRoles.find((name) => !holdable.includes(name))
  if (unknown !== undefined) throw new Error(`creatorAppRoles names "${unknown}", which a member cannot hold: ${holdable.join(', ')}`)
  const names = options.names
  if (names !== undefined && (typeof names.singular !== 'string' || names.singular.trim() === '' || typeof names.plural !== 'string' || names.plural.trim() === '')) {
    throw new Error('organizations.names needs a singular and a plural, such as { singular: "Workspace", plural: "Workspaces" }')
  }
  if (options.createDescription !== undefined && options.createDescription.trim() === '') throw new Error('organizations.createDescription cannot be empty')
  if (options.default !== undefined) checkDefaultOrganization(options.default)
  if (options.existingUsersRole !== undefined && !holdable.includes(options.existingUsersRole)) {
    throw new Error(`organizations.existingUsersRole is "${options.existingUsersRole}", which a member cannot hold: ${holdable.join(', ')}`)
  }
  const days = options.invitationDays ?? 7
  if (!(days > 0)) throw new Error('invitationDays must be more than 0')
  return {
    definitions,
    creatorAppRoles,
    create: options.create ?? 'admins',
    invitationExpiresIn: Math.round(days * 24 * 60 * 60),
    membershipLimit: options.membershipLimit ?? 1000,
    generateId: options.generateId ?? (() => crypto.randomUUID()),
    deleteRecords: options.deleteRecords ?? 'refuse',
    ...(options.invitationUrl !== undefined && { invitationUrl: options.invitationUrl }),
    options,
  }
}
