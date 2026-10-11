import type { TenantValue } from '../../types'

/** Webhook subscriptions made in the admin app (`extends: [webhooks()]`), kept in a table of the app's database. */
export type WebhooksOptions = {
  /** The schema of the subscriptions table and the deliveries view; default `webhooks`. */
  schema?: string
  /** Also keep every try, successes too, for 30 days, listed as Webhook delivery log. Default false. */
  deliveryLog?: boolean
  /**
   * The roles a subscription's owner holds now in its tenant, which it delivers as. Default: read from the project's
   * Better Auth (`auth`); a project that signs people in otherwise passes its own.
   */
  ownerRoles?: (owner: { id: string; tenant?: TenantValue }) => Promise<string[]>
  /**
   * Lets subscriptions send to private, loopback and link-local addresses, for development and tests. Default false:
   * a URL whose host resolves to one is refused, so a subscription cannot reach the app's own network.
   */
  allowPrivateAddresses?: boolean
}

const schemaPattern = /^[a-z_][a-z0-9_]*$/

/** The schema of the options, checked. */
export const webhooksSchema = (options: WebhooksOptions = {}) => {
  const schema = options.schema ?? 'webhooks'
  if (!schemaPattern.test(schema)) throw new Error(`Invalid webhooks schema "${schema}": use lowercase letters, digits and "_"`)
  return schema
}

/** A table subscription's name among all subscriptions: config ones cannot start with `ui:`. */
export const tableSubscriptionName = (id: string) => `ui:${id}`

/** The event names and patterns of a subscription row: separated by spaces or commas. */
export const parseEvents = (text: string) => text.split(/[\s,]+/).filter((part) => part !== '')
