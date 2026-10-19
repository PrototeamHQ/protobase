import { Building2, Mail, Network, Users } from 'lucide-react'
import type { CurrentOrganization, OrganizationRole, RoleLabel } from '@protobase/client'
import type { ProfileMenuItem } from '../app-shell'
import { text } from './messages'

// Under `/-/`, like the account pages: page names start with a letter, and a resource would need a table named `-`.
export const organizationsPath = '/-/organizations'
export const organizationPath = '/-/organization'
export const membersPath = '/-/organization/members'
export const invitationsPath = '/-/organization/invitations'

const pageTitles: Record<string, 'organizations' | 'organization' | 'members' | 'invitations'> = {
  [organizationsPath]: 'organizations',
  [organizationPath]: 'organization',
  [membersPath]: 'members',
  [invitationsPath]: 'invitations',
}

/** The title of the organization page at `path`; undefined for any other path. */
export const organizationPageTitle = (path: string) => {
  const id = pageTitles[path]
  return id && text(id)
}

/** The word for an organization role. */
export const organizationRoleLabel = (role: OrganizationRole) => text(role)

/** The label of an app role, as the server names it. */
export const roleLabel = (roles: readonly RoleLabel[], name: string) => roles.find((role) => role.name === name)?.label ?? name

/** Whether the person manages the current organization: its owners and admins. */
export const managesOrganization = (current?: CurrentOrganization) => current?.role === 'owner' || current?.role === 'admin'

/**
 * The organization pages in the profile menu: every organization of the person, and for the one they work in its
 * details, and for its owners and admins its members and invitations.
 */
export const organizationMenuItems = (basePath: string, path: string, current?: CurrentOrganization): ProfileMenuItem[] => {
  const item = (id: string, label: string, icon: ProfileMenuItem['icon'], target: string) => ({ id, label, icon, href: `${basePath}${target}`, active: path === target })
  return [
    item('organizations', text('organizations'), Network, organizationsPath),
    ...(current?.organization ? [item('organization', text('organization'), Building2, organizationPath)] : []),
    ...(managesOrganization(current) ? [item('members', text('members'), Users, membersPath), item('invitations', text('invitations'), Mail, invitationsPath)] : []),
  ]
}

/** The app roles someone may give or take away: those they hold, those their roles grant, and every one for a superuser. */
export const grantableRoles = (roles: readonly RoleLabel[], current?: CurrentOrganization) => {
  const held = [...(current?.globalRoles ?? []), ...(current?.appRoles ?? [])]
  const membership = roles.filter((role) => role.membership).map((role) => role.name)
  if (held.includes('admin')) return new Set(membership)
  const granted = held.flatMap((name) => roles.find((role) => role.name === name)?.grants ?? [])
  return new Set([...held, ...granted].filter((name) => membership.includes(name)))
}
