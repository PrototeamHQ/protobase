import type { EarlierResult } from './cache-types'

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
  /**
   * Gives the answer with its body unread and no limit on its size, for a step that streams it on, such as into
   * storage; the step reads it as a stream, never as a whole.
   */
  stream?: boolean
}

/**
 * The only way a plugin sends a request: it resolves the host once, refuses a private, loopback or link-local address
 * (unless the app allows them), connects to the address it checked, follows no redirect and reads at most `maxBytes`
 * of the body as sent, never decoding a `Content-Encoding`. The answer's body is already read, unless `stream`.
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

/**
 * A file kept in a storage configuration: the configuration's name, the server that holds it for a local one, and its
 * path there. It says where the file is, never how to reach it: no folder, bucket or key.
 */
export type StoredFile = { configuration: string; node?: string; path: string; name: string; type: string; size: number }

/**
 * Files in the app's storage configurations, by name, as the workflow's last editor may read them now: naming one they
 * may not read fails as one that does not exist (`Storage.NotFound`).
 */
export type PluginStorage = {
  /** Streams `body` to `path` in the configuration, replacing what is there; it is whole or not there at all. */
  put(configuration: string, path: string, body: ReadableStream<Uint8Array>, file: { name: string; type: string }): Promise<StoredFile>
  /** The bytes of a stored file, as a stream; `field` names the argument in the error. Fails as `Storage.NotFound` when it is gone. */
  read(file: unknown, field: string): Promise<{ file: StoredFile; body: ReadableStream<Uint8Array> }>
}

type Key = string | number | (string | number)[]
type Record_ = Record<string, unknown>

/**
 * The app's records, read and written as the user who saved the version the run runs, with the roles they hold now,
 * through the API: its access rules, tenant scope, validation and write hooks apply. A refusal fails the step with
 * `Records.Refused`. A create in a retry of a step after its records committed creates none again and returns them.
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
  /**
   * A current access token; throws `ConnectionError` when the workflow has no working sign-in for it. `refresh` gets a
   * new one even before the current one expires, for a token the provider refused.
   */
  accessToken(options?: { refresh?: boolean }): Promise<string>
}

/** What the app gives every hook of a plugin: its guarded requests, records, files, storage and mail. */
export type PluginServices = {
  fetch: PluginFetch
  records: PluginRecords
  files: PluginFiles
  storage: PluginStorage
  /** Undefined when the app sends no mail. */
  mail: PluginMail | undefined
}

/** What a step's `run` gets: its checked input, the app's services, and the step's own run details. */
export type StepContext<Input = Record<string, unknown>> = PluginServices & {
  input: Input
  runId: string
  /** The same for every retry of one visit of this step in this run; a later visit of the step, such as in a loop, gets a new one. */
  idempotencyKey: string
  /** Aborted at the step's timeout, or when the worker stops. */
  signal: AbortSignal
  /** Adds a line to the step's logs, secrets blanked out. */
  log: (message: string) => void
  /** The text with the app's secrets blanked out, for a step that cuts text short. */
  redact: (text: string) => string
  /** Undefined unless the step declares a `connection`. */
  connection: PluginConnection | undefined
  /**
   * Sends from the own mailbox of the person who turned on the version this run runs, signed in as themselves, while
   * they may still change the workflow; undefined when the app links no mailboxes (`auth.personalMail`).
   */
  mailbox: PluginMail | undefined
  /** For a step type whose cache offers it (`use: 'offer'`): the earlier call's result with the same key, when one serves. */
  earlier?: EarlierResult
  /** Wraps the result a step takes from `earlier`, cleaned or as it was, so the cache keeps the entry as it is. */
  reuse: (output: unknown) => unknown
}
