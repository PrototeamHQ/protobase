import { Command, Option } from 'commander'
import { createInterface } from 'node:readline/promises'
import { parseTtl } from './ttl'

// The modules that load the project's auth, and @protobase/server with it, are imported when a command runs.
const out = (text: string) => process.stdout.write(text)

const loadAuth = async () => (await import('./load-auth')).loadProjectAuth(process.cwd())

const projectApi = async () => {
  const [{ usersApi }, auth] = await Promise.all([import('./users-api'), loadAuth()])
  return usersApi(auth)
}

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
    .option('--no-password', 'no password: the user signs in by emailed code, passkey or a sign-in provider')
    .option('--github-id <id>', 'link the user to this GitHub user id, so signing in with GitHub finds them whatever their address')
    .option('--organization <organization>', 'with organizations: add the user to this one (its slug or id)')
    .option('--org-role <role>', 'with --organization: owner, admin or member (default member)')
    .option('--app-roles <roles>', 'with --organization: app roles there, comma separated')
    .addOption(new Option('--password <value>').hideHelp())
    .action(async (email: string, opts) => {
      const { readHidden, rejectPasswordArgument } = await import('./password')
      rejectPasswordArgument(opts.password)
      const [{ createUserCommand }, { usersApi }, { organizationsApi }, { addMemberCommand }, auth] = await Promise.all([
        import('./commands'),
        import('./users-api'),
        import('../organizations/api'),
        import('../organizations/commands'),
        loadAuth(),
      ])
      await createUserCommand(
        usersApi(auth),
        { email, name: opts.name, role: opts.role, passwordStdin: opts.passwordStdin, generatePassword: opts.generatePassword, noPassword: opts.password === false, githubId: opts.githubId },
        { stdin: process.stdin, prompt: readHidden },
        out,
      )
      if (opts.organization) await addMemberCommand(organizationsApi(auth), { organization: opts.organization, email, orgRole: opts.orgRole, appRoles: opts.appRoles }, out)
      finish(0)
    })

  users
    .command('delete')
    .description('Delete a user (refuses the last admin)')
    .argument('<email>')
    .option('--yes', 'skip the confirmation', false)
    .action(async (email: string, opts) => {
      const { deleteUserCommand } = await import('./manage')
      await deleteUserCommand(await projectApi(), { email, yes: opts.yes }, ask, out)
      finish(0)
    })

  users
    .command('set-role')
    .description('Change a user\'s role, or several comma separated (refuses to demote the last admin)')
    .argument('<email>')
    .argument('<role>')
    .action(async (email: string, role: string) => {
      const { setRoleCommand } = await import('./manage')
      await setRoleCommand(await projectApi(), { email, role }, out)
      finish(0)
    })

  for (const disabled of [true, false]) {
    users
      .command(disabled ? 'disable' : 'enable')
      .description(disabled ? 'Ban a user and revoke their sessions' : 'Lift a ban')
      .argument('<email>')
      .action(async (email: string) => {
        const { setDisabledInProject } = await import('./set-disabled')
        await setDisabledInProject(await loadAuth(), { email, disabled }, out)
        finish(0)
      })
  }

  users
    .command('roles')
    .description('List the roles of the project (the first is admin)')
    .action(async () => {
      const { listRolesCommand } = await import('./commands')
      await listRolesCommand(await projectApi(), out)
      finish(0)
    })

  users
    .command('list')
    .description('List users: email, role, creation date')
    .action(async () => {
      const { listUsersCommand } = await import('./commands')
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
      const [{ issueToken }, auth] = await Promise.all([import('@protobase/server'), loadAuth()])
      const { token } = await issueToken(auth, { email, ttlSeconds })
      out(`${token}\n`)
      finish(0)
    })
}
