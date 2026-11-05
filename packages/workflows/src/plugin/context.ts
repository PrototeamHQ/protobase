/** A JSON Schema (draft-07), as plain data: what a step or trigger takes and gives. */
export type JsonSchema = Record<string, unknown>

/** What `fetch` takes: a request's method, headers and body, and the most of the answer's body it reads. */
export type PluginFetchInit = {
  method?: string
  headers?: HeadersInit
  body?: string | Uint8Array
  signal?: AbortSignal
  /** The most bytes of the answer's body read off the wire; a longer body fails. Default and maximum 10 MiB. */
  maxBytes?: number
}

/**
 * The only way a plugin sends a request: it resolves the host once, refuses a private, loopback or link-local address
 * (unless the app allows them), connects to the address it checked, follows no redirect and reads at most `maxBytes`
 * of the body as sent, never decoding a `Content-Encoding`. The answer's body is already read.
 */
export type PluginFetch = (url: string, init?: PluginFetchInit) => Promise<Response>

/** A file of the run: the handle the API gives for a file field. */
export type FileValue = { uri: string; name: string; type: string; size: number }

/** The run's own files: a step keeps what it downloaded and reads what an earlier step kept, never other files. */
export type PluginFiles = {
  keep(bytes: Uint8Array, name: string, type: string): Promise<FileValue>
  /** The bytes of a file of this run; `field` names the argument in the error when it is not one. */
  read(value: unknown, field: string): Promise<{ name: string; type?: string; bytes: Uint8Array }>
}

type Key = string | number | (string | number)[]
type Record_ = Record<string, unknown>

/**
 * The app's records, read and written as the user who saved the version the run runs, with the roles they hold now,
 * through the API: its access rules, tenant scope, validation and write hooks apply. A refusal fails the step with
 * `Records.Refused`.
 */
export type PluginRecords = {
  create(resource: string, data: Record_): Promise<Record_>
  /** Several records in one batch, all or none. */
  createMany(resource: string, data: Record_[]): Promise<Record_[]>
  update(resource: string, key: Key, data: Record_): Promise<Record_>
  get(resource: string, key: Key): Promise<Record_>
  list(resource: string, query: { filter?: string; order_by?: string; limit?: number }): Promise<Record_[]>
}

/** One message from the app's own sender. */
export type PluginMailMessage = {
  to: string
  subject: string
  text: string
  html?: string
  headers?: Record<string, string>
  attachments?: { filename: string; content: Uint8Array; contentType?: string }[]
}

export type PluginMail = { send(message: PluginMailMessage): Promise<void> }

/** The sign-in a step or trigger declared, bound by its workflow; it names no other. */
export type PluginConnection = {
  /** A current access token; throws `ConnectionError` when the workflow has no working sign-in for it. */
  accessToken(): Promise<string>
}

/** What the app gives every hook of a plugin: its guarded requests, records, files and mail. */
export type PluginServices = {
  fetch: PluginFetch
  records: PluginRecords
  files: PluginFiles
  /** Undefined when the app sends no mail. */
  mail: PluginMail | undefined
}

/** What a step's `run` gets: its checked input, the app's services, and the step's own run details. */
export type StepContext<Input = Record<string, unknown>> = PluginServices & {
  input: Input
  runId: string
  /** The same for every try of this step in this run. */
  idempotencyKey: string
  /** Aborted at the step's timeout, or when the worker stops. */
  signal: AbortSignal
  /** Adds a line to the step's logs, secrets blanked out. */
  log: (message: string) => void
  /** The text with the app's secrets blanked out, for a step that cuts text short. */
  redact: (text: string) => string
  /** Undefined unless the step declares a `connection`. */
  connection: PluginConnection | undefined
}
