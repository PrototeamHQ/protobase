import { authError } from './auth-error'
import type { BetterAuthClient } from './better-auth-client'

/** A role someone can act with: its name and the label to show. */
export type RoleOption = { name: string; label: string }

/**
 * The role the session acts with, the only one its tokens carry (`null` for someone without a role), and the roles the
 * person holds where the session works, to switch to.
 */
export type ActiveRole = { active: string | null; roles: RoleOption[] }

/**
 * Switching the role the session acts with. Its tokens carry that role alone, so a switch fetches a new token at once
 * (`refreshToken`), as a switch of organization does. Each call rejects with `AuthError`.
 */
export const rolesClient = (client: BetterAuthClient, refreshToken: () => Promise<unknown>) => ({
  current: async () => {
    const { data, error } = await client.$fetch<ActiveRole>('/role/current', { method: 'GET' })
    if (error) throw authError(error, 'Could not read your roles')
    return data as ActiveRole
  },

  /** Acts with another role the person holds from now on, in this session and the next ones. */
  switchTo: async (role: string) => {
    const { error } = await client.$fetch('/role/switch', { method: 'POST', body: { role } })
    if (error) throw authError(error, 'Could not switch the role')
    await refreshToken()
  },
})

export type RolesClient = ReturnType<typeof rolesClient>
