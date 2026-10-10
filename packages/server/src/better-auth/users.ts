import type { AdminAuth } from './create-auth'
import { parseRoles } from './parse-roles'

export { parseRoles }

// Storage goes through Better Auth's own adapters (`adapter` and `internalAdapter` of `auth.$context`), which also map
// model and column names, never through its tables. The admin plugin's HTTP-style endpoints (banUser, setRole,
// removeUser, revokeUserSessions) need a signed-in admin session, so a host without one (the CLI) cannot call them;
// they use the same internalAdapter calls as here. Written against better-auth 1.7.7.

/** The roles this auth instance allows, `admin` first. */
export const roleChoices = (auth: AdminAuth) => [...auth.roles]

const checkRoles = (auth: AdminAuth, role: string) => {
  const wanted = role.split(',').map((name) => name.trim()).filter(Boolean)
  const unknown = wanted.filter((name) => !auth.roles.includes(name))
  if (wanted.length === 0 || unknown.length > 0) throw new Error(`Unknown role "${unknown[0] ?? role}"; use ${auth.roles.join(', ')}`)
  return wanted
}

/** An account at a sign-in provider, as Better Auth keys it: `{ providerId: 'github', accountId: '<GitHub user id>' }`. */
export type LinkedAccount = { providerId: string; accountId: string }

export type NewUser = { email: string; password: string; name?: string; role?: string; accounts?: LinkedAccount[] }
export type StoredUser = { id: string; email: string; role: string; banned: boolean; createdAt: string }

/** Whether the admin store has any user yet. */
export const hasUsers = async (auth: AdminAuth) => (await auth.$context).adapter.count({ model: 'user' }).then((count) => count > 0)

// Accounts at a provider that sign in someone already; the user's password account is Better Auth's own.
const checkAccounts = async (auth: AdminAuth, accounts: LinkedAccount[]) => {
  const { internalAdapter } = await auth.$context
  for (const account of accounts) {
    if (!account.providerId || !account.accountId || account.providerId === 'credential') throw new Error(`Cannot link an account "${account.providerId}:${account.accountId}"`)
    if (await internalAdapter.findAccountByKey(account)) throw new Error(`The ${account.providerId} account ${account.accountId} signs in another user already`)
  }
}

/**
 * Creates a user directly in the admin store. Host side only (no HTTP route creates accounts while the store is empty):
 * the first user is always an `admin`, later ones get `role` (default `user`). The address counts as verified, so the
 * user can also sign in with an emailed code. `accounts` link the user to sign-in providers up front, so a provider
 * signs them in by its own id whatever address it reports; one that signs in another user already is refused.
 */
export const createUser = async (auth: AdminAuth, input: NewUser) => {
  const first = !(await hasUsers(auth))
  const requested = input.role ?? auth.defaultRole
  if (!first && requested === undefined) throw new Error(`A role is required: choose one of ${auth.roles.join(', ')}`)
  const role = first ? 'admin' : checkRoles(auth, requested!).join(',')
  const accounts = input.accounts ?? []
  await checkAccounts(auth, accounts)
  const { user } = await auth.api.createUser({
    body: { email: input.email, password: input.password, name: input.name ?? input.email.split('@')[0]!, role: role as 'user' | 'admin' },
  })
  const { internalAdapter } = await auth.$context
  for (const account of accounts) await internalAdapter.linkAccount({ userId: user.id, ...account })
  return { id: user.id, email: user.email, role: String(user.role) }
}


type Row = { id: string; email: string; role?: string | string[] | null; banned?: boolean | null; createdAt: Date | string }

const allUsers = async (auth: AdminAuth) => {
  const { adapter } = await auth.$context
  return adapter.findMany<Row>({ model: 'user', sortBy: { field: 'createdAt', direction: 'asc' } })
}

const rolesOf = (user: Row) => parseRoles(user.role)
const isAdmin = (user: Row) => rolesOf(user).includes('admin')
const isActiveAdmin = (user: Row) => isAdmin(user) && !user.banned

const findUser = async (auth: AdminAuth, email: string) => {
  const user = (await allUsers(auth)).find((candidate) => candidate.email.toLowerCase() === email.toLowerCase())
  if (!user) throw new Error(`No user with email ${email}`)
  return user
}

// Every caller goes through here, so the last admin can never be removed, demoted or banned by accident.
const refuseLastAdmin = async (auth: AdminAuth, user: Row, action: string) => {
  if (!isActiveAdmin(user)) return
  const admins = (await allUsers(auth)).filter(isActiveAdmin)
  if (admins.length <= 1) throw new Error(`Cannot ${action} the last admin`)
}

export const listUsers = async (auth: AdminAuth): Promise<StoredUser[]> =>
  (await allUsers(auth)).map((user) => ({
    id: user.id,
    email: user.email,
    role: rolesOf(user).join(','),
    banned: Boolean(user.banned),
    createdAt: new Date(user.createdAt).toISOString(),
  }))

/** Deletes the user with their sessions and accounts; refuses to delete the last active admin. */
export const deleteUser = async (auth: AdminAuth, email: string) => {
  const user = await findUser(auth, email)
  await refuseLastAdmin(auth, user, 'delete')
  const { internalAdapter } = await auth.$context
  await internalAdapter.deleteUserSessions(user.id)
  await internalAdapter.deleteUser(user.id)
}

/** Sets the role: one of the configured roles, or several separated by commas; refuses to demote the last active admin. */
export const setUserRole = async (auth: AdminAuth, input: { email: string; role: string }) => {
  const wanted = checkRoles(auth, input.role)
  const user = await findUser(auth, input.email)
  if (!wanted.includes('admin')) await refuseLastAdmin(auth, user, 'demote')
  await (await auth.$context).internalAdapter.updateUser(user.id, { role: wanted.join(',') })
  return { email: user.email, role: wanted.join(',') }
}

/** Disables or re-enables sign-in. Banning ends the user's sessions; the last active admin cannot be banned. */
export const setUserBanned = async (auth: AdminAuth, input: { email: string; banned: boolean }) => {
  const user = await findUser(auth, input.email)
  const { internalAdapter } = await auth.$context
  if (!input.banned) {
    await internalAdapter.updateUser(user.id, { banned: false, banReason: null, banExpires: null })
    return
  }
  await refuseLastAdmin(auth, user, 'ban')
  await internalAdapter.updateUser(user.id, { banned: true, banReason: 'Disabled by an administrator', banExpires: null })
  await internalAdapter.deleteUserSessions(user.id)
}
