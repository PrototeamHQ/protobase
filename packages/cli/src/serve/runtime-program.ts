import { Command, Option } from 'commander'
import { rejectPasswordArgument } from '../users/password'

export type CreateAdminOptions = { name?: string; passwordStdin: boolean; generatePassword: boolean }

// What each command does, injected so the routing is testable without a bundle or a database.
export type RuntimeActions = {
  serve: (bundle: string) => Promise<void>
  migrate: (bundle: string) => Promise<void>
  createAdmin: (bundle: string, email: string, options: CreateAdminOptions) => Promise<void>
}

/**
 * The serve runtime's commands. `serve` is the default, so `protobase-serve <config module>`, which hosts run, keeps
 * serving that module's API alone; given the bundle folder it serves the app too.
 */
export const runtimeProgram = (actions: RuntimeActions) => {
  const program = new Command('protobase-serve').description("Protobase's serve runtime for a bundle from `protobase build`")

  program
    .command('serve', { isDefault: true })
    .description('Serve a bundle: its folder serves the app and the API, its config module the API alone')
    .argument('<bundle>')
    .action((bundle: string) => actions.serve(bundle))

  program
    .command('migrate')
    .description("Apply the bundle's pending migrations in one transaction, before a new version serves (DATABASE_URL)")
    .argument('<bundle>')
    .action((bundle: string) => actions.migrate(bundle))

  program
    .command('create-admin')
    .description('Create an admin user of the bundle\'s app')
    .argument('<bundle>')
    .argument('<email>')
    .option('--name <name>', 'display name')
    .option('--password-stdin', 'read the password from stdin', false)
    .option('--generate-password', 'generate a strong password and print it once', false)
    .addOption(new Option('--password <value>').hideHelp())
    .action((bundle: string, email: string, opts) => {
      rejectPasswordArgument(opts.password)
      return actions.createAdmin(bundle, email, { name: opts.name, passwordStdin: opts.passwordStdin, generatePassword: opts.generatePassword })
    })

  return program
}
