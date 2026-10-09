import type { AuthUser } from '@protobase/client'
import type { ShellUser } from '../app-shell'

const hueOf = (text: string) => [...text].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 360, 7)

const initialsOf = (name: string) =>
  name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('')

/** What the sidebar's profile menu shows for a signed-in user. */
export const userToShell = (user: AuthUser): ShellUser => {
  const roles = (user.role ?? 'user').split(',').map((role) => role.trim())
  const admin = roles.includes('admin')
  return {
    name: user.name || user.email,
    email: user.email,
    initials: initialsOf(user.name || user.email) || '?',
    hue: hueOf(user.id || user.email),
    role: admin ? 'Admin' : (roles[0] ?? 'user').replace(/^./, (char) => char.toUpperCase()),
    roleTone: admin ? 'violet' : 'blue',
  }
}
