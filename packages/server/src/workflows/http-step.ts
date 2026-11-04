import { StepError, type TaskHandler } from '@protobase/workflows'
import { AddressRefusedError, pinnedRequest, type Resolve } from '../webhooks/table/pinned-request'
import { readLimited } from '../webhooks/table/read-limited'

/** The most of an answer's body the `http` step reads; a larger one fails the step. */
export const httpBodyLimit = 10 * 1024 * 1024

type HttpArguments = { url?: unknown; method?: unknown; headers?: unknown; query?: unknown; body?: unknown }

const methods = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'])

const invalid = (reason: string) => new StepError('Http.InvalidArguments', reason)

const isTextRecord = (value: unknown): value is Record<string, string> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && Object.values(value).every((item) => typeof item === 'string')

const request = (args: HttpArguments) => {
  if (typeof args.url !== 'string' || !URL.canParse(args.url)) throw invalid('url must be an http or https URL')
  const method = args.method === undefined ? 'GET' : String(args.method).toUpperCase()
  if (!methods.has(method)) throw invalid(`method must be one of ${[...methods].join(', ')}`)
  if (args.headers !== undefined && !isTextRecord(args.headers)) throw invalid('headers must be an object of text values')
  if (args.query !== undefined && !isTextRecord(args.query)) throw invalid('query must be an object of text values')
  const url = new URL(args.url)
  for (const [name, value] of Object.entries(args.query ?? {})) url.searchParams.append(name, value)
  const headers = new Headers(args.headers)
  // A body of text is sent as it is; any other value as JSON.
  const body = args.body === undefined || method === 'GET' || method === 'HEAD' ? undefined : typeof args.body === 'string' ? args.body : JSON.stringify(args.body)
  if (body !== undefined && typeof args.body !== 'string' && !headers.has('content-type')) headers.set('content-type', 'application/json')
  return { url, method, headers, body }
}

// The body as JSON when the answer says it is, else as text.
const bodyOf = (bytes: Uint8Array, type: string | null) => {
  const text = new TextDecoder().decode(bytes)
  if (!type || !/[/+]json\b/i.test(type) || text === '') return text
  try {
    return JSON.parse(text) as unknown
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error
    throw new StepError('Http.InvalidBody', 'The answer says it is JSON but does not parse as JSON')
  }
}

/**
 * The `http` step: one request to `url`, built at run time, through the pinned request, which resolves its host once
 * and connects only to a public address it checked. It returns `{ status, headers, body }`, reads at most
 * `httpBodyLimit` of the body, follows no redirect, and fails with `Http.StatusError` on any status from 300 up.
 */
export const httpStep = ({ allowPrivateAddresses = false, resolve }: { allowPrivateAddresses?: boolean; resolve?: Resolve } = {}): TaskHandler => async (args, { signal, log }) => {
  const { url, method, headers, body } = request((args ?? {}) as HttpArguments)
  const started = Date.now()
  const response = await pinnedRequest(url.href, { method, headers, ...(body !== undefined && { body }), signal }, { allowPrivateAddresses, ...(resolve && { resolve }) }).catch((error: unknown) => {
    if (error instanceof AddressRefusedError) throw new StepError('Http.AddressRefused', error.message)
    throw error
  })
  const bytes = await readLimited(response, httpBodyLimit + 1)
  log(`${method} ${url.origin}${url.pathname}: ${response.status} in ${Date.now() - started} ms`)
  if (bytes.length > httpBodyLimit) throw new StepError('Http.ResponseTooLarge', `The answer's body is larger than ${httpBodyLimit / 1024 / 1024} MiB, the most the http step reads`)
  if (response.status >= 300) throw new StepError('Http.StatusError', `${url.host} answered ${response.status}`)
  // Cookies the receiver sets are sessions of its own, not data for later steps.
  const kept = Object.fromEntries([...response.headers].filter(([name]) => name !== 'set-cookie'))
  return { status: response.status, headers: kept, body: bodyOf(bytes, response.headers.get('content-type')) }
}
