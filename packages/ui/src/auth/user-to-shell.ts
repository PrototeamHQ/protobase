import type { AuthUser } from '@protobase/client'
import type { ShellUser } from '../app-shell'
import { text } from './messages'

/** The hue of someone's avatar, the same for the same id. */
export const hueOf = (text: string) => [...text].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 360, 7)

/** The initials of someone's avatar: the first letters of the first two words of their name. */
export const initialsOf = (name: string) =>
  name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('')

const rolesOf = (user: AuthUser) => (user.role ?? 'user').split(',').map((role) => role.trim())

/** The user holds the `admin` role, among others perhaps. */
export const isAdmin = (user: AuthUser) => rolesOf(user).includes('admin')

/** What the sidebar's profile menu shows for a signed-in user. */
export const userToShell = (user: AuthUser): ShellUser => {
  const roles = rolesOf(user)
  const admin = roles.includes('admin')
  return {
    name: user.name || user.email,
    email: user.email,
    initials: initialsOf(user.name || user.email) || '?',
    hue: hueOf(user.id || user.email),
    role: admin ? text('admin') : (roles[0] ?? 'user').replace(/^./, (char) => char.toUpperCase()),
    roleTone: admin ? 'violet' : 'blue',
  }
}
