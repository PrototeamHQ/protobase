import type { Command } from 'commander'

const out = (text: string) => void process.stdout.write(text)
const note = (text: string) => void process.stderr.write(text)

// The modules that load the project, and @protobase/server with it, are imported when a command runs.
const withStore = async (work: (store: import('@protobase/server').RelayStore) => Promise<void>) => {
  const { store, close } = await (await import('./load-store')).loadRelayStore(process.cwd())
  await work(store).finally(close)
}

export const registerPushRelay = (program: Command) => {
  const relay = program.command('push-relay').description('Manage the workspace credentials of the push relay in the current directory')

  relay
    .command('add-credential')
    .description('Add a credential bound to a workspace origin and print it once')
    .argument('<origin>', 'the workspace origin, such as https://app.example.com')
    .action(async (origin: string) => withStore(async (store) => (await import('./credentials')).addCredentialCommand(store, origin, out, note)))

  relay
    .command('list-credentials')
    .description('List the credentials: id, origin and when each was added')
    .action(async () => withStore(async (store) => (await import('./credentials')).listCredentialsCommand(store, out)))

  relay
    .command('remove-credential')
    .description('Remove a credential, so its sends are refused')
    .argument('<id>')
    .action(async (id: string) => withStore(async (store) => (await import('./credentials')).removeCredentialCommand(store, id, out)))
}
