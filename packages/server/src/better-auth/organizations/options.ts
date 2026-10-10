import type { OrganizationOptions } from 'better-auth/plugins/organization'
import { membershipRoles, type RoleDefinitions } from './role-definitions'
import type { StoredMember, StoredOrganization } from './store'

type OrganizationHooks = NonNullable<OrganizationOptions['organizationHooks']>

export type OrganizationsOptions = {
  /** The app roles an organization's creator holds there: `'all'` (default), every role a member can hold, or a list. */
  creatorAppRoles?: 'all' | string[]
  /** Who may create organizations: `'admins'` (default), superusers only, or `'everyone'` signed in. */
  create?: 'admins' | 'everyone'
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
  /** The page an invitation link opens, with `?token=`. Default `{baseURL}/-/invitation`. */
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
  invitationUrl: string
  options: OrganizationsOptions
}

export const resolveOrganizations = (options: OrganizationsOptions, definitions: RoleDefinitions, baseURL: string): ResolvedOrganizations => {
  const holdable = membershipRoles(definitions)
  const creatorAppRoles = options.creatorAppRoles === undefined || options.creatorAppRoles === 'all' ? holdable : options.creatorAppRoles
  const unknown = creatorAppRoles.find((name) => !holdable.includes(name))
  if (unknown !== undefined) throw new Error(`creatorAppRoles names "${unknown}", which a member cannot hold: ${holdable.join(', ')}`)
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
    invitationUrl: options.invitationUrl ?? `${baseURL.replace(/\/$/, '')}/-/invitation`,
    options,
  }
}
