import type { Command } from 'commander'

export const registerNotifications = (program: Command) => {
  const notifications = program.command('notifications').description('Set up the delivery of notifications')

  notifications
    .command('vapid-keys')
    .description('Print a fresh VAPID key pair for Web Push, as PROTOBASE_VAPID_PUBLIC_KEY and PROTOBASE_VAPID_PRIVATE_KEY')
    .action(async () => (await import('./print-vapid-keys')).printVapidKeys((text) => void process.stdout.write(text), (text) => void process.stderr.write(text)))
}
