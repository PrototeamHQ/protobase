import type { AuthUser } from '@protobase/client'
import type { ShellUser } from '../app-shell'
import { capitalise } from '../live/naming'
import { hueOf, initialsOf } from '../primitives/avatar-initials'
import { text } from './messages'

export { hueOf, initialsOf }

const rolesOf = (user: AuthUser) => (user.role ?? 'user').split(',').map((role) => role.trim())

/** The user holds the `admin` role, among others perhaps. */
export const isAdmin = (user: AuthUser) => rolesOf(user).includes('admin')

/** A role's name as words: `full_access` becomes "Full access". */
const roleLabel = (role: string) => capitalise(role.replace(/[_-]+/g, ' ').trim())

/** What the sidebar's profile menu shows for a signed-in user. */
export const userToShell = (user: AuthUser): ShellUser => {
  const roles = rolesOf(user)
  const admin = roles.includes('admin')
  return {
    name: user.name || user.email,
    email: user.email,
    initials: initialsOf(user.name || user.email) || '?',
    hue: hueOf(user.id || user.email),
    role: admin ? text('admin') : roleLabel(roles[0] ?? 'user'),
    roleTone: admin ? 'violet' : 'blue',
  }
}
