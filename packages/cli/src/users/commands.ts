import { resolvePassword, type PasswordDeps } from './password'

// The host-side user functions of @protobase/server, injected so the commands are testable.
export type UsersApi = {
  hasUsers: () => Promise<boolean>
  roles: () => Promise<{ roles: string[]; defaultRole?: string }>
  createUser: (input: { email: string; password: string; name?: string; role?: string }) => Promise<{ id: string; email: string; role: string }>
  listUsers: () => Promise<{ id: string; email: string; role: string; createdAt: string; banned?: boolean }[]>
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
}

export const createUserCommand = async (
  api: UsersApi,
  options: CreateUserOptions,
  deps: PasswordDeps,
  out: (text: string) => void,
) => {
  if (!options.email.includes('@')) throw new Error(`"${options.email}" is not an email address`)
  const { password, generated } = await resolvePassword(options, deps)
  // The first user is always an admin, whatever --role says.
  const first = !(await api.hasUsers())
  const role = first ? 'admin' : options.role
  const user = await api.createUser({
    email: options.email,
    password,
    ...(role && { role }),
    ...(options.name && { name: options.name }),
  })
  out(`Created ${user.role} ${user.email}\n`)
  if (generated) out(`Password (shown once): ${password}\n`)
}

export const listUsersCommand = async (api: UsersApi, out: (text: string) => void) => {
  const users = await api.listUsers()
  if (users.length === 0) {
    out('No users yet. Create the first admin with: protobase users create you@example.com\n')
    return
  }
  const width = Math.max(...users.map((user) => user.email.length), 5)
  out(`${'EMAIL'.padEnd(width)}  ${'ROLE'.padEnd(8)}  CREATED\n`)
  for (const user of users) out(`${user.email.padEnd(width)}  ${user.role.padEnd(8)}  ${user.createdAt}${user.banned ? '  disabled' : ''}\n`)
}

export const listRolesCommand = async (api: UsersApi, out: (text: string) => void) => {
  const { roles, defaultRole } = await api.roles()
  for (const role of roles) out(`${role}${role === defaultRole ? '  (default for new users)' : ''}\n`)
}
