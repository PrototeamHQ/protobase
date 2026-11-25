import { everyOrganization, type EveryOrganization, type Organization } from '@protobase/query'
import { pinLine, resolveOptionalPin, scopeOf, type PinOptions, type PinSource } from '../organizations/pin'
import { parseRoleList } from '../organizations/commands'
import { resolvePassword, type PasswordDeps } from './password'

// The host-side user functions of @protobase/server, injected so the commands are testable.

/** Where a page of users ends, as `listUsers` of @protobase/server answers it. */
export type UsersCursor = { createdAt: string; id: string }

export type UsersApi = PinSource & {
  hasUsers: () => Promise<boolean>
  /** The roles, and the labels the app shows for them, such as Superuser for admin. */
  roles: () => Promise<{ roles: string[]; defaultRole?: string; labels: Record<string, string> }>
  createUser: (input: { email: string; password?: string; name?: string; role?: string; accounts?: { providerId: string; accountId: string }[] }) => Promise<{ id: string; email: string; role: string }>
  /** A page of the users, oldest first, from the `next` of the page before: the members of `scope`, or every user. */
  listUsers: (scope: Organization | EveryOrganization, after?: UsersCursor) => Promise<{ users: { id: string; email: string; role: string; createdAt: string; banned?: boolean }[]; next?: UsersCursor }>
  deleteUser: (email: string) => Promise<void>
  setUserRole: (input: { email: string; role: string }) => Promise<{ email: string; role: string }>
  setUserBanned: (input: { email: string; banned: boolean }) => Promise<void>
  /** Adds the user as a member of the organization with this id. */
  addMember: (input: { organization: string; email: string; role?: string; appRoles?: string[] }) => Promise<unknown>
}

export type CreateUserOptions = {
  email: string
  name?: string
  role?: string
  passwordStdin: boolean
  generatePassword: boolean
  /** No password: the user signs in by emailed code, passkey or a sign-in provider. */
  noPassword?: boolean
  /** The user's GitHub user id, so GitHub sign-in finds them by it. */
  githubId?: string
}

/** `users create`: the account, and with organizations its membership of the pinned organization. */
export type CreateMemberOptions = CreateUserOptions & PinOptions & {
  /** With organizations: the organization role in the pinned organization, `member` unless given. */
  orgRole?: string
  /** With organizations: the app roles in the pinned organization, comma separated. */
  appRoles?: string
}

const githubId = /^[1-9][0-9]*$/

// The labels the app shows for the roles of `role` ("admin" or "a,b"), where they differ from the names the CLI takes.
const shownAs = (role: string, labels: Record<string, string>) => {
  const names = role.split(',')
  const shown = names.map((name) => labels[name] ?? name)
  return shown.some((label, index) => label.toLowerCase() !== names[index]!.toLowerCase()) ? `, shown in the app as ${shown.join(', ')}` : ''
}

export const createUserCommand = async (
  api: UsersApi,
  options: CreateUserOptions,
  deps: PasswordDeps,
  out: (text: string) => void,
) => {
  if (!options.email.includes('@')) throw new Error(`"${options.email}" is not an email address`)
  if (options.githubId !== undefined && !githubId.test(options.githubId)) throw new Error(`"${options.githubId}" is not a GitHub user id, a number such as 583231`)
  const { password, generated } = await resolvePassword(options, deps)
  // The first user is always an admin, whatever --role says.
  const first = !(await api.hasUsers())
  const role = first ? 'admin' : options.role
  const user = await api.createUser({
    email: options.email,
    ...(password !== undefined && { password }),
    ...(role && { role }),
    ...(options.name && { name: options.name }),
    ...(options.githubId && { accounts: [{ providerId: 'github', accountId: options.githubId }] }),
  })
  const { labels } = await api.roles()
  out(`Created ${user.role} ${user.email}${shownAs(user.role, labels)}${options.githubId ? `, linked to GitHub user ${options.githubId}` : ''}\n`)
  if (generated) out(`Password (shown once): ${password}\n`)
  return { email: user.email, first }
}

/**
 * Creates the user (`createUserCommand`) and, with organizations, adds them to the pinned organization, or to none
 * with `--all-organizations`. The pin is resolved first, so an unknown organization creates nobody.
 */
export const createMemberCommand = async (api: UsersApi, options: CreateMemberOptions, deps: PasswordDeps, out: (text: string) => void) => {
  if (options.allOrganizations && !api.organizationsOn) throw new Error('--all-organizations needs organizations: turn on auth.organizations in the config')
  if (options.allOrganizations && options.organization !== undefined) throw new Error('Pass --organization or --all-organizations, not both')
  // With --all-organizations the account joins none, so no organization's rows are read.
  const pin = options.allOrganizations ? undefined : await resolveOptionalPin(api, options, 'users create')
  const user = await createUserCommand(api, options, deps, out)
  if (options.allOrganizations) out(`${user.email} joins no organization\n`)
  if (!pin || 'every' in pin) return
  // The first user owns every organization without members already, the pinned one among them.
  if (user.first && (await api.isMember(pin.organization.id, user.email))) {
    out(`${user.email} owns ${pin.organization.slug}\n`)
    return
  }
  const appRoles = parseRoleList(options.appRoles)
  await api.addMember({ organization: pin.organization.id, email: user.email, ...(options.orgRole && { role: options.orgRole }), ...(appRoles && { appRoles }) })
  out(`Added ${user.email} to ${pin.organization.slug}${options.orgRole ? ` as ${options.orgRole}` : ''}\n`)
}

/**
 * Prints the users, oldest first, a page at a time as the store pages them; the first page sets the columns' width. With
 * organizations, the members of the pinned organization, or every user with `--all-organizations`.
 */
export const listUsersCommand = async (api: UsersApi, options: PinOptions, out: (text: string) => void) => {
  const pin = await resolveOptionalPin(api, options, 'users list', () => everyOrganization('protobase users list: --all-organizations'))
  if (pin) out(pinLine(pin))
  const scope = pin && scopeOf(pin)
  let page = await api.listUsers(scope)
  if (page.users.length === 0) {
    out('No users yet. Create the first admin with: protobase users create you@example.com\n')
    return
  }
  const width = Math.max(...page.users.map((user) => user.email.length), 5)
  out(`${'EMAIL'.padEnd(width)}  ${'ROLE'.padEnd(8)}  CREATED\n`)
  for (;;) {
    for (const user of page.users) out(`${user.email.padEnd(width)}  ${user.role.padEnd(8)}  ${user.createdAt}${user.banned ? '  disabled' : ''}\n`)
    if (!page.next) return
    page = await api.listUsers(scope, page.next)
  }
}

export const listRolesCommand = async (api: UsersApi, out: (text: string) => void) => {
  const { roles, defaultRole } = await api.roles()
  for (const role of roles) out(`${role}${role === defaultRole ? '  (default for new users)' : ''}\n`)
}
