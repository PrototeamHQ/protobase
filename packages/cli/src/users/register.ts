import { Command, Option } from 'commander'
import { createInterface } from 'node:readline/promises'
import { createUser, deleteUser, hasUsers, issueToken, listUsers, roleChoices, setUserBanned, setUserRole, type AdminAuth } from '@protobase/server'
import { createUserCommand, listRolesCommand, listUsersCommand, type UsersApi } from './commands'
import { deleteUserCommand, setDisabledCommand, setRoleCommand } from './manage'
import { loadProjectAuth } from './load-auth'
import { readHidden, rejectPasswordArgument } from './password'
import { parseTtl } from './ttl'

const out = (text: string) => process.stdout.write(text)

// The commands over a project's Better Auth instance.
export const usersApi = (auth: AdminAuth): UsersApi => ({
  hasUsers: () => hasUsers(auth),
  roles: async () => ({ roles: roleChoices(auth), defaultRole: auth.defaultRole }),
  createUser: (input) => createUser(auth, input),
  listUsers: () => listUsers(auth),
  deleteUser: (email) => deleteUser(auth, email),
  setUserRole: (input) => setUserRole(auth, input),
  setUserBanned: (input) => setUserBanned(auth, input),
})

const projectApi = async () => usersApi(await loadProjectAuth(process.cwd()))

const ask = async (question: string) => {
  if (!process.stdin.isTTY) throw new Error('Confirmation needs a terminal; pass --yes to skip it')
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await rl.question(question)
  rl.close()
  return answer
}

// The auth store keeps a connection pool open, so the commands end the process themselves.
const finish = (code: number) => process.exit(code)

export const registerUsers = (program: Command) => {
  const users = program.command('users').description('Manage the admin users of the project in the current directory')

  users
    .command('create')
    .description('Create a user; the first user is always an admin')
    .argument('<email>')
    .option('--name <name>', 'display name')
    .option('--role <role>', 'role for users after the first (default: the project\'s default role; see `users roles`)')
    .option('--password-stdin', 'read the password from stdin', false)
    .option('--generate-password', 'generate a strong password and print it once', false)
    .addOption(new Option('--password <value>').hideHelp())
    .action(async (email: string, opts) => {
      rejectPasswordArgument(opts.password)
      await createUserCommand(
        await projectApi(),
        { email, name: opts.name, role: opts.role, passwordStdin: opts.passwordStdin, generatePassword: opts.generatePassword },
        { stdin: process.stdin, prompt: readHidden },
        out,
      )
      finish(0)
    })

  users
    .command('delete')
    .description('Delete a user (refuses the last admin)')
    .argument('<email>')
    .option('--yes', 'skip the confirmation', false)
    .action(async (email: string, opts) => {
      await deleteUserCommand(await projectApi(), { email, yes: opts.yes }, ask, out)
      finish(0)
    })

  users
    .command('set-role')
    .description('Change a user\'s role, or several comma separated (refuses to demote the last admin)')
    .argument('<email>')
    .argument('<role>')
    .action(async (email: string, role: string) => {
      await setRoleCommand(await projectApi(), { email, role }, out)
      finish(0)
    })

  for (const disabled of [true, false]) {
    users
      .command(disabled ? 'disable' : 'enable')
      .description(disabled ? 'Ban a user and revoke their sessions' : 'Lift a ban')
      .argument('<email>')
      .action(async (email: string) => {
        await setDisabledCommand(await projectApi(), { email, disabled }, out)
        finish(0)
      })
  }

  users
    .command('roles')
    .description('List the roles of the project (the first is admin)')
    .action(async () => {
      await listRolesCommand(await projectApi(), out)
      finish(0)
    })

  users
    .command('list')
    .description('List users: email, role, creation date')
    .action(async () => {
      await listUsersCommand(await projectApi(), out)
      finish(0)
    })
}

// Prints only the token on stdout, so `$(protobase token me@example.com)` works in scripts.
export const registerToken = (program: Command) => {
  program
    .command('token')
    .description('Print a bearer token (JWT) for an existing user')
    .argument('<email>')
    .option('--ttl <duration>', 'lifetime: 30s, 15m, up to 24h', '15m')
    .action(async (email: string, opts) => {
      const ttlSeconds = parseTtl(opts.ttl)
      const auth = await loadProjectAuth(process.cwd())
      const { token } = await issueToken(auth, { email, ttlSeconds })
      out(`${token}\n`)
      finish(0)
    })
}
