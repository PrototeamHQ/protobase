import type { JsonSchema, PluginConnection, PluginFetch, StepContext } from './context'

/** What a type shows in the type list the MCP tools and the editor read. */
type Described = {
  label: string
  description: string
  /** What it takes, checked before it runs. */
  input: JsonSchema
  /** What it gives: a step's result, or a trigger's run input. */
  output?: JsonSchema
  /** The name of a connection the plugin declares, which it signs in with. */
  connection?: string
}

/** A step type, which a Task names as `<plugin>:<key>` in its `Resource`. */
export type StepType = Described & {
  /** The errors it fails with, by name, as `<Prefix>.<Name>`, each with what it means. */
  errors?: Record<string, string>
  /** The prefix of its error names, such as `Http`; an input that does not fit fails as `<prefix>.InvalidArguments`. Default `Step`. */
  errorPrefix?: string
  run: (context: StepContext) => Promise<unknown>
}

/** What every trigger type has: its description, and a check of its input beyond its schema, such as a cron's fields. */
type TriggerBase = Described & { check?: (input: Record<string, unknown>) => { field?: string; message: string }[] }

/** What a trigger's hooks get: its checked input, its connection, and the guarded `fetch`. */
export type TriggerContext = { input: Record<string, unknown>; connection: PluginConnection | undefined; fetch: PluginFetch; signal: AbortSignal }

/**
 * A trigger that starts one run per record that becomes ready: `when` is a filter on `resource` in the filter language,
 * whose `<timestamp field> <= now() - <duration>` terms make the start wait until that time. A record starts once per
 * ready key: its record key and the values of the `key` fields.
 */
export type ReadyTrigger = TriggerBase & {
  kind: 'ready'
  ready: (input: Record<string, unknown>) => { resource: string; when?: string; key?: string[] }
}

/** One new thing a poll or a webhook call found: `key` is unique for the trigger, `data` becomes the run's input. */
export type TriggerItem = { key: string; data: unknown }

/** How often a polling trigger polls: a duration such as `1 minute`, or a cron in an IANA time zone (default UTC). */
export type PollEvery = string | { cron: string; timezone?: string }

/** A trigger that asks a service for new items on a schedule. */
export type PollingTrigger = TriggerBase & {
  kind: 'polling'
  /** How often it polls, or how often for a given input, such as a schedule's own cron. */
  every: PollEvery | ((input: Record<string, unknown>) => PollEvery)
  /** The most items one poll returns, at most 100. */
  limit?: number
  /** Called once, when the trigger has no cursor yet: its first cursor, such as the newest item's id. */
  start: (context: TriggerContext) => Promise<unknown>
  /** Items after `cursor`, and the next cursor, which must move forward. `due` is the time this poll was queued for. */
  poll: (context: TriggerContext & { cursor: unknown; store: unknown; limit: number; due: Date }) => Promise<{ items: TriggerItem[]; cursor: unknown; store?: unknown }>
}

/**
 * A webhook call as the run sees it, once the route checked its signature: the method, the query, the headers without
 * any credential (`authorization`, `cookie`, `webhook-*`, the signature header, `x-forwarded-*`), the body as JSON, form
 * fields or text, or as a file of the run when the call would be over 1 MiB as JSON, and when it came. The address is left out: it holds
 * the key.
 */
export type WebhookEvent = { method: string; query: Record<string, string>; headers: Record<string, string>; body: unknown; received_at: string }

/** One run a webhook call starts: `key` starts it once per workflow, such as the sender's message id. */
export type WebhookItem = { key?: string; data: unknown }

/** A trigger that the app's webhook URL starts, after the route checked the call's signature. */
export type WebhookTrigger = TriggerBase & {
  kind: 'webhook'
  /** Registers the URL and its secret with the service, returning what `unsubscribe` and `renew` need. */
  subscribe?: (context: TriggerContext & { url: string; secret: string }) => Promise<unknown>
  unsubscribe?: (context: TriggerContext & { state: unknown }) => Promise<void>
  renew?: (context: TriggerContext & { state: unknown }) => Promise<unknown>
  renewEvery?: string
  /**
   * The runs a call starts, at most 100: `event` is the call as above, `request` the same call with its bytes, and
   * `idempotencyKey` the signed `webhook-id` or the configured idempotency header, when the call has one.
   */
  receive: (context: { request: Request; event: WebhookEvent; idempotencyKey: string | undefined; input: Record<string, unknown> }) => Promise<{ items: WebhookItem[]; response?: Response }>
}

export type TriggerType = ReadyTrigger | PollingTrigger | WebhookTrigger

/** The endpoints of an OAuth 2.0 provider a connection signs in with that is not one of the app's sign-in providers. */
export type OAuthEndpoints = {
  authorization_url: string
  token_url: string
  /** Answers the account's `sub` or `id`, and its `email` and `name` when it has them, for the access token. */
  user_info_url: string
  /** Where disconnecting revokes the token (RFC 7009); without it, disconnecting only deletes it. */
  revocation_url?: string
  /** Sends a PKCE challenge (S256); default true. */
  pkce?: boolean
}

/**
 * A sign-in a plugin's types use: one of the app's sign-in providers (`signIn`, such as `google`), or an OAuth provider
 * of its own (`oauth`), whose client id and secret the app's owner gives in `auth.connections`. Connecting asks for
 * `scopes` with `link_params`, such as those that ask for a refresh token.
 */
export type ConnectionDeclaration = {
  label: string
  scopes?: string[]
  link_params?: Record<string, string>
} & ({ signIn: string; revocation_url?: string } | { oauth: OAuthEndpoints })

/** A workflow plugin: the trigger and step types it adds, and the sign-ins they use. */
export type Plugin = {
  /** Its types are named `<name>:<key>`. */
  name: string
  label: string
  connections?: Record<string, ConnectionDeclaration>
  triggers?: Record<string, TriggerType>
  steps?: Record<string, StepType>
}
