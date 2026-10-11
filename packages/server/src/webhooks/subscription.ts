import type { Db } from '@protobase/query'
import type { EventActor, EventOperation } from '@protobase/schema'
import type { Row, TenantValue } from '../types'

/** What happened, as a receiver gets it in the `data` of an event. Records use field names, as the API shows them. */
export type EventData = {
  resource: string
  operation: EventOperation
  /** The record's key as its URL has it. */
  key: string
  /** Grows with every change of a record, so a receiver can drop an event older than one it has. */
  sequence: string
  after?: Row
  before?: Row
  changed: string[]
  tenant?: TenantValue
  actor: EventActor | null
  source: 'api' | 'database'
  transaction: string
}

/** One event as it is delivered: the body of a URL or function target, and what a `run` handler gets. */
export type SubscriptionEvent = {
  /** The same on every retry and resend: the receiver's idempotency key (`webhook-id`). */
  id: string
  type: string
  /** When the change's transaction started, ISO 8601. */
  timestamp: string
  data: EventData
}

/** What a `run` handler gets beside the event. */
export type RunContext = {
  db: Db
  /** 1 for the first try. */
  attempt: number
  signal: AbortSignal
}

/** What every subscription may set beside its target. */
export type SubscriptionCommon = {
  /** Event names, such as `orders.created`, `orders.*` for every event of a resource, or `*` for all of them. */
  events: string[]
  /** A filter on the record, after the change or before a delete, in the language of access rules. */
  when?: string
  /**
   * Who the subscription delivers as: it gets only the records and fields these roles may read. Without it, every record
   * and every field but the sensitive ones.
   */
  as?: { roles: string[] }
  /** Only events of records of this tenant (organization). */
  tenant?: TenantValue
  /** `thin` leaves the records out: a receiver reads them through the API. Default `full`. */
  payload?: 'full' | 'thin'
  /** One delivery at a time per record, in order; a failing one holds back the record's next. Default false. */
  ordered?: boolean
  /** Default true. */
  enabled?: boolean
}

/** How a URL or function target is called: a POST of the event as JSON, signed with Standard Webhooks headers. */
export type SentOptions = {
  /** Signs the requests (`whsec_` and base64, as `verifyStandardWebhook` takes it); unsigned without one. */
  secret?: string
  headers?: Record<string, string>
  /** The body sent instead of the event, such as Slack's `{ text }`. */
  body?: (event: SubscriptionEvent) => unknown
}

export type UrlTarget = { url: string | undefined } & SentOptions
/** An API function of the app, `/api/functions/<name>`, called in this process. */
export type FunctionTarget = { function: string } & SentOptions
/** Code run for each event; it throws to have the event retried. Config only. */
export type RunTarget = { run: (event: SubscriptionEvent, context: RunContext) => Promise<void> | void }

export type SubscriptionOptions = SubscriptionCommon & (UrlTarget | FunctionTarget | RunTarget)

export type SubscriptionDefinition = { readonly kind: 'subscription'; readonly name: string; readonly options: SubscriptionOptions }

const namePattern = /^[A-Za-z][A-Za-z0-9_-]*$/

const targets = ['url', 'function', 'run'] as const

/** Which of the three targets the options name. */
export const targetOf = (options: SubscriptionOptions) => targets.find((target) => target in options)!

/**
 * Delivers the events it names, as they happen: export it from the config module like a resource. The URL usually
 * comes from the environment (`url: process.env.SLACK_WEBHOOK`); the server refuses to start while an enabled one is
 * empty.
 */
export const subscription = (name: string, options: SubscriptionOptions): SubscriptionDefinition => {
  if (!namePattern.test(name)) throw new Error(`Subscription name "${name}" must start with a letter and hold only letters, digits, "_" and "-"`)
  const named = targets.filter((target) => target in options)
  if (named.length !== 1) throw new Error(`Subscription "${name}" needs one target: url, function or run${named.length > 1 ? `, not ${named.join(' and ')}` : ''}`)
  if (options.events.length === 0) throw new Error(`Subscription "${name}" names no events`)
  return { kind: 'subscription', name, options }
}

export const isSubscription = (value: unknown): value is SubscriptionDefinition =>
  typeof value === 'object' && value !== null && (value as { kind?: unknown }).kind === 'subscription' && typeof (value as { name?: unknown }).name === 'string'

/** Whether an event name matches a subscription's pattern: the name, `<resource>.*` or `*`. */
export const eventPatternMatches = (pattern: string, event: string) =>
  pattern === '*' || pattern === event || (pattern.endsWith('.*') && event.startsWith(pattern.slice(0, -1)))
