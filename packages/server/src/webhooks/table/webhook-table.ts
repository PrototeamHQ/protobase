import type { AdminAuth } from '../../better-auth/create-auth'
import { checkWebhookUrl } from './address-check'
import { webhooksSchema, type WebhooksOptions } from './options'
import { betterAuthOwnerRoles } from './owner-roles'
import { tableSubscriptions } from './table-subscriptions'

/**
 * What `createAdmin` needs for the subscriptions of `webhooks()`: the table, the owners' current roles (from Better Auth
 * unless the options say otherwise) and, unless allowed, the check that keeps URLs off private addresses.
 */
export const webhookTable = (options: WebhooksOptions, auth?: AdminAuth) => {
  const ownerRoles = options.ownerRoles ?? (auth && betterAuthOwnerRoles(auth))
  if (!ownerRoles) throw new Error('webhooks() delivers as each subscription\'s owner, with their current roles: pass `auth` (Better Auth) or `ownerRoles` to webhooks()')
  return {
    subscriptions: tableSubscriptions({ schema: webhooksSchema(options), ownerRoles, deliveryLog: Boolean(options.deliveryLog) }),
    ...(!options.allowPrivateAddresses && { checkUrl: checkWebhookUrl }),
  }
}
