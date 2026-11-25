import { sql } from 'kysely'
import type { AdminAuth } from './create-auth'
import { isActiveAdmin } from './last-admin'
import { revokeMcpGrants } from './mcp/revoke-grants'
import { ownOrganizationsWithoutMembers } from './organizations/host'
import { rowsIn, type HostScope } from './organizations/host-scope'
import type { AuthContext } from './organizations/store'
import { parseRoles } from './parse-roles'
import { activeAdminExists } from './store/active-admin'
import { isEveryOrganization } from '@protobase/query'
import { inSignInScope } from '../organization-scope/sign-in-organization'
import { pageOf } from './store/page-of'
import { exists } from './store/store-reads'
import { storeSqlOf, type StoreSql } from './store/store-sql'

export { parseRoles }

// Storage goes through Better Auth's own adapters (`adapter` and `internalAdapter` of `auth.$context`), which also map
// model and column names; what they cannot ask, whether another active admin exists and a keyset page of the users,
// goes to the store as SQL (`store/store-sql.ts`). The admin plugin's HTTP-style endpoints (banUser, setRole,
// removeUser, revokeUserSessions) need a signed-in admin session, so a host without one (the CLI) cannot call them;
// they use the same internalAdapter calls as here. Written against better-auth 1.7.7.

// The instance's context is typed by its own options; the store functions take the context of any instance.
const contextOf = async (auth: AdminAuth) => (await auth.$context) as unknown as AuthContext

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

/**
 * Without `password` the user signs in by emailed code, passkey or a sign-in provider only. `metadata` lands in the
 * user metadata column, which `auth.users.metadata` names; it needs one.
 */
export type NewUser = { email: string; password?: string; name?: string; role?: string; accounts?: LinkedAccount[]; metadata?: Record<string, unknown> }
export type StoredUser = { id: string; email: string; role: string; banned: boolean; createdAt: string }

/** Whether the admin store has any user yet. */
export const hasUsers = async (auth: AdminAuth) => exists((await auth.$context).adapter, 'user', [])

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
 * signs them in by its own id whatever address it reports; one that signs in another user already is refused. With
 * organizations, the first user also owns every organization without members, such as those an app's seed made.
 */
export const createUser = async (auth: AdminAuth, input: NewUser) => {
  const first = !(await hasUsers(auth))
  const requested = input.role ?? auth.defaultRole
  if (!first && requested === undefined) {
    // An address that has its user already is the problem then, not the missing role (Better Auth says so with one).
    if (await (await auth.$context).internalAdapter.findUserByEmail(input.email.toLowerCase())) {
      throw new Error(`A user with email ${input.email} exists already; use another email`)
    }
    throw new Error(`A role is required: choose one of ${auth.roles.join(', ')}`)
  }
  const role = first ? 'admin' : checkRoles(auth, requested!).join(',')
  const accounts = input.accounts ?? []
  await checkAccounts(auth, accounts)
  const { user } = await auth.api.createUser({
    body: { email: input.email, ...(input.password !== undefined && { password: input.password }), name: input.name ?? input.email.split('@')[0]!, role: role as 'user' | 'admin', ...(input.metadata && { data: { metadata: input.metadata } }) },
  })
  const { internalAdapter } = await auth.$context
  for (const account of accounts) await internalAdapter.linkAccount({ userId: user.id, ...account })
  if (first && auth.organizations) await ownOrganizationsWithoutMembers(auth, user.id)
  return { id: user.id, email: user.email, role: String(user.role) }
}


type Row = { id: string; email: string; role?: string | string[] | null; banned?: boolean | null; createdAt: Date | string }

const rolesOf = (user: Row) => parseRoles(user.role)

const findUser = async (auth: AdminAuth, email: string) => {
  const found = await (await auth.$context).internalAdapter.findUserByEmail(email.toLowerCase())
  if (!found) throw new Error(`No user with email ${email}`)
  return found.user as Row
}

// Every host caller goes through here, and HTTP callers through `lastAdminGuardPlugin`, so the last admin can never be
// removed, demoted or banned by accident.
const refuseLastAdmin = async (auth: AdminAuth, user: Row, action: string) => {
  if (!isActiveAdmin(user)) return
  if (!(await activeAdminExists(storeSqlOf(await contextOf(auth)), { except: user.id }))) throw new Error(`Cannot ${action} the last admin`)
}

/** Where a page of `listUsers` ends: pass it as `after` for the next page. */
export type UsersCursor = { createdAt: string; id: string }

/** The users a page holds, oldest first, and where the next page starts; no `next` on the last page. */
export type UsersPage = { users: StoredUser[]; next?: UsersCursor }

/** The users a page of `listUsers` holds when it is not told. */
export const usersPageSize = 500

/**
 * A page of the users, oldest first: `size` of them from `after`, the `next` of the page before, as Postgres pages them.
 * With organizations, `scope` is the organization whose members it lists, or every organization; every user without.
 */
export const listUsers = async (auth: AdminAuth, { after, size = usersPageSize, scope }: { after?: UsersCursor; size?: number; scope?: HostScope } = {}): Promise<UsersPage> => {
  if (scope === undefined || isEveryOrganization(scope)) return usersPage(auth, { after, size })
  return inSignInScope(scope, () => usersPage(auth, { after, size, scope }))
}

// The users who are members of the organization `scope` keeps the store to, as a table the page reads.
const membersOf = (store: StoreSql, scope: HostScope) => {
  const member = store.table('member')
  return sql`(select * from ${store.table('user')} u where exists (select from ${rowsIn(store, scope, member)} as m where m.${member.columns.user_id} = u.id)) as u`
}

const usersPage = async (auth: AdminAuth, { after, size, scope }: { after?: UsersCursor; size: number; scope?: HostScope }): Promise<UsersPage> => {
  const store = storeSqlOf(await contextOf(auth))
  const user = store.table('user')
  const u = user.columns
  const from = scope === undefined ? user : membersOf(store, scope)
  const select = { id: sql`id`, email: u.email, role: u.role, banned: u.banned, createdAt: u.created_at }
  const page = await pageOf<Row>(store, { from, select, key: [u.created_at, sql`id`], ...(after && { after: [after.createdAt, after.id] }), size })
  const users = page.rows.map((user) => ({ id: user.id, email: user.email, role: rolesOf(user).join(','), banned: Boolean(user.banned), createdAt: new Date(user.createdAt).toISOString() }))
  return { users, ...(page.next && { next: { createdAt: page.next[0]!, id: page.next[1]! } }) }
}

/**
 * Deletes the user with their sessions and accounts, their MCP grants with MCP on, and what `auth.userDeletion`
 * removes; refuses to delete the last active admin.
 */
export const deleteUser = async (auth: AdminAuth, email: string) => {
  const user = await findUser(auth, email)
  await refuseLastAdmin(auth, user, 'delete')
  const { internalAdapter } = await auth.$context
  await auth.userDeletion.run(user.id)
  await internalAdapter.deleteUserSessions(user.id)
  if (auth.mcp) await revokeMcpGrants((await auth.$context).adapter, user.id)
  await internalAdapter.deleteUser(user.id)
  await auth.userDeletion.run(user.id)
}

/** Sets the role: one of the configured roles, or several separated by commas; refuses to demote the last active admin. */
export const setUserRole = async (auth: AdminAuth, input: { email: string; role: string }) => {
  const wanted = checkRoles(auth, input.role)
  const user = await findUser(auth, input.email)
  if (!wanted.includes('admin')) await refuseLastAdmin(auth, user, 'demote')
  await (await auth.$context).internalAdapter.updateUser(user.id, { role: wanted.join(',') })
  return { email: user.email, role: wanted.join(',') }
}

/**
 * Disables or re-enables sign-in. Banning ends the user's sessions and, with MCP on, disconnects their MCP clients and
 * forgets them, so re-enabling brings none back: each has to be allowed again. The last active admin cannot be banned.
 */
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
  // Without MCP the OAuth plugin is not loaded, so its tables are not read.
  if (auth.mcp) await revokeMcpGrants((await auth.$context).adapter, user.id)
}
