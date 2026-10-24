import type { Command } from 'commander'
import { printVapidKeys } from './print-vapid-keys'

export const registerNotifications = (program: Command) => {
  const notifications = program.command('notifications').description('Set up the delivery of notifications')

  notifications
    .command('vapid-keys')
    .description('Print a fresh VAPID key pair for Web Push, as PROTOBASE_VAPID_PUBLIC_KEY and PROTOBASE_VAPID_PRIVATE_KEY')
    .action(() => printVapidKeys((text) => void process.stdout.write(text), (text) => void process.stderr.write(text)))
}
