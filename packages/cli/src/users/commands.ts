import { resolvePassword, type PasswordDeps } from './password'

// The host-side user functions of @protobase/server, injected so the commands are testable.

/** Where a page of users ends, as `listUsers` of @protobase/server answers it. */
export type UsersCursor = { createdAt: string; id: string }

export type UsersApi = {
  hasUsers: () => Promise<boolean>
  /** The roles, and the labels the app shows for them, such as Superuser for admin. */
  roles: () => Promise<{ roles: string[]; defaultRole?: string; labels: Record<string, string> }>
  createUser: (input: { email: string; password?: string; name?: string; role?: string; accounts?: { providerId: string; accountId: string }[] }) => Promise<{ id: string; email: string; role: string }>
  /** A page of the users, oldest first, from the `next` of the page before. */
  listUsers: (after?: UsersCursor) => Promise<{ users: { id: string; email: string; role: string; createdAt: string; banned?: boolean }[]; next?: UsersCursor }>
  deleteUser: (email: string) => Promise<void>
  setUserRole: (input: { email: string; role: string }) => Promise<{ email: string; role: string }>
  setUserBanned: (input: { email: string; banned: boolean }) => Promise<void>
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
}

/** Prints every user, oldest first, a page at a time as the store pages them; the first page sets the columns' width. */
export const listUsersCommand = async (api: UsersApi, out: (text: string) => void) => {
  let page = await api.listUsers()
  if (page.users.length === 0) {
    out('No users yet. Create the first admin with: protobase users create you@example.com\n')
    return
  }
  const width = Math.max(...page.users.map((user) => user.email.length), 5)
  out(`${'EMAIL'.padEnd(width)}  ${'ROLE'.padEnd(8)}  CREATED\n`)
  for (;;) {
    for (const user of page.users) out(`${user.email.padEnd(width)}  ${user.role.padEnd(8)}  ${user.createdAt}${user.banned ? '  disabled' : ''}\n`)
    if (!page.next) return
    page = await api.listUsers(page.next)
  }
}

export const listRolesCommand = async (api: UsersApi, out: (text: string) => void) => {
  const { roles, defaultRole } = await api.roles()
  for (const role of roles) out(`${role}${role === defaultRole ? '  (default for new users)' : ''}\n`)
}
