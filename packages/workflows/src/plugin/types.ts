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

/** A trigger that asks a service for new items on a schedule. */
export type PollingTrigger = TriggerBase & {
  kind: 'polling'
  /** A duration such as `1 minute`, or a cron in an IANA time zone. */
  every: string | { cron: string; timezone?: string }
  /** The most items one poll returns, at most 100. */
  limit?: number
  start: (context: TriggerContext) => Promise<unknown>
  /** Items after `cursor`, and the next cursor, which must move forward. */
  poll: (context: TriggerContext & { cursor: unknown; store: unknown; limit: number }) => Promise<{ items: TriggerItem[]; cursor: unknown; store?: unknown }>
}

/** A trigger that the app's webhook URL starts, after the route checked the call's signature. */
export type WebhookTrigger = TriggerBase & {
  kind: 'webhook'
  /** Registers the URL with the service, returning what `unsubscribe` and `renew` need. */
  subscribe?: (context: TriggerContext & { url: string }) => Promise<unknown>
  unsubscribe?: (context: TriggerContext & { state: unknown }) => Promise<void>
  renew?: (context: TriggerContext & { state: unknown }) => Promise<unknown>
  renewEvery?: string
  receive: (context: { request: Request; input: Record<string, unknown> }) => Promise<{ items: TriggerItem[]; response?: Response }>
}

export type TriggerType = ReadyTrigger | PollingTrigger | WebhookTrigger

/** A sign-in a plugin's types use: one of the app's sign-in providers, or an OAuth provider of its own. */
export type ConnectionDeclaration = {
  label: string
  scopes?: string[]
} & (
  | { signIn: string }
  | { oauth: { authorization_url: string; token_url: string; user_info_url?: string; revocation_url?: string; pkce?: boolean } }
)

/** A workflow plugin: the trigger and step types it adds, and the sign-ins they use. */
export type Plugin = {
  /** Its types are named `<name>:<key>`. */
  name: string
  label: string
  connections?: Record<string, ConnectionDeclaration>
  triggers?: Record<string, TriggerType>
  steps?: Record<string, StepType>
}
