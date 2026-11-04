import { StepError, type TaskHandler } from '@protobase/workflows'
import type { FilesRuntime } from '../files/runtime'
import { AddressRefusedError, pinnedRequest, type Resolve } from '../webhooks/table/pinned-request'
import { readLimited } from '../webhooks/table/read-limited'
import { readRunFile, storeRunFile } from './run-files'

/** The most of an answer's body the `http` step reads; a larger one fails the step. */
export const httpBodyLimit = 10 * 1024 * 1024

/** How much of a failing answer's body its error keeps, after secrets are blanked out of it. */
const causeBodyLength = 200

type HttpArguments = { url?: unknown; method?: unknown; headers?: unknown; query?: unknown; body?: unknown; response?: unknown }

const methods = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
const readings = new Set(['json', 'text', 'file'])

const invalid = (reason: string) => new StepError('Http.InvalidArguments', reason)

const isTextRecord = (value: unknown): value is Record<string, string> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && Object.values(value).every((item) => typeof item === 'string')

const isFileValue = (value: unknown) => typeof value === 'object' && value !== null && !Array.isArray(value) && typeof (value as { uri?: unknown }).uri === 'string'

const checked = (args: HttpArguments) => {
  if (typeof args.url !== 'string' || !URL.canParse(args.url)) throw invalid('url must be an http or https URL')
  const method = args.method === undefined ? 'GET' : String(args.method).toUpperCase()
  if (!methods.has(method)) throw invalid(`method must be one of ${[...methods].join(', ')}`)
  if (args.headers !== undefined && !isTextRecord(args.headers)) throw invalid('headers must be an object of text values')
  if (args.query !== undefined && !isTextRecord(args.query)) throw invalid('query must be an object of text values')
  const response = args.response ?? 'json'
  if (typeof response !== 'string' || !readings.has(response)) throw invalid('response must be json, text or file')
  const url = new URL(args.url)
  for (const [name, value] of Object.entries(args.query ?? {})) url.searchParams.append(name, value)
  return { url, method, headers: new Headers(args.headers), response }
}

// The answer's body as `response` says: parsed JSON (null when empty), text, or a file the run keeps.
const answerBody = async (bytes: Uint8Array, response: string, url: URL, type: string | null, keep: (bytes: Uint8Array, name: string, type: string) => Promise<unknown>) => {
  if (response === 'file') return keep(bytes, decodeURIComponent(url.pathname.slice(url.pathname.lastIndexOf('/') + 1)), type?.split(';')[0]?.trim() || 'application/octet-stream')
  const text = new TextDecoder().decode(bytes)
  if (response === 'text') return text
  if (text.trim() === '') return null
  try {
    return JSON.parse(text) as unknown
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error
    throw new StepError('Http.InvalidBody', `${url.host} answered with a body that is not JSON; read it with "response": "text"`)
  }
}

export type HttpStepOptions = {
  /** Lets the step reach private, loopback and link-local addresses, for development and tests. Default false. */
  allowPrivateAddresses?: boolean
  resolve?: Resolve
  /** The app's files, where `response: "file"` keeps an answer and a file value's bytes are read from. */
  files?: () => FilesRuntime | undefined
}

/**
 * The `app:http` step: one request to `url`, built at run time, through the pinned request, which resolves its host
 * once and connects only to a public address it checked. It follows no redirect, reads at most `httpBodyLimit` of
 * the answer, and fails with `Http.Status` on a status outside 2xx, `Http.Network` when no answer came.
 */
export const httpStep = ({ allowPrivateAddresses = false, resolve, files = () => undefined }: HttpStepOptions = {}): TaskHandler => async (args, { runId, signal, log, redact }) => {
  const given = (args ?? {}) as HttpArguments
  const { url, method, headers, response: reading } = checked(given)
  let body: string | Uint8Array | undefined
  if (given.body !== undefined && method !== 'GET') {
    if (isFileValue(given.body)) {
      const file = await readRunFile(files(), runId, given.body, 'body')
      body = file.bytes
      if (!headers.has('content-type')) headers.set('content-type', file.ref.type ?? 'application/octet-stream')
    } else if (typeof given.body === 'string') {
      body = given.body
    } else {
      body = JSON.stringify(given.body)
      if (!headers.has('content-type')) headers.set('content-type', 'application/json')
    }
  }
  const started = Date.now()
  const answer = await pinnedRequest(url.href, { method, headers, ...(body !== undefined && { body }), signal }, { allowPrivateAddresses, ...(resolve && { resolve }) }).catch((error: unknown) => {
    if (error instanceof AddressRefusedError) throw new StepError('Http.AddressRefused', error.message)
    if (signal.aborted) throw error
    throw new StepError('Http.Network', `No answer from ${url.host}: ${error instanceof Error ? error.message : String(error)}`)
  })
  const bytes = await readLimited(answer, httpBodyLimit + 1)
  log(`${method} ${url.origin}${url.pathname}: ${answer.status} in ${Date.now() - started} ms`)
  if (bytes.length > httpBodyLimit) throw new StepError('Http.ResponseTooLarge', `The answer's body is larger than ${httpBodyLimit / 1024 / 1024} MiB, the most the http step reads`)
  if (answer.status < 200 || answer.status > 299) {
    const excerpt = redact(new TextDecoder().decode(bytes)).slice(0, causeBodyLength)
    throw new StepError('Http.Status', `${url.host} answered ${answer.status}${excerpt ? `: ${excerpt}` : ''}`)
  }
  // Cookies the receiver sets are sessions of its own, not data for later steps.
  const kept = Object.fromEntries([...answer.headers].filter(([name]) => name !== 'set-cookie'))
  const keep = (data: Uint8Array, name: string, type: string) => storeRunFile(files(), runId, data, name, type)
  return { status: answer.status, headers: kept, body: await answerBody(bytes, reading, url, answer.headers.get('content-type'), keep) }
}
