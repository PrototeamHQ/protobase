import { AddressRefusedError, fetchMaxBytes, isFileValue, ResponseTooLargeError, StepError, type StepContext, type StepType, type StorageTarget } from '@protobase/workflows/plugin'
import { stepPath } from './storage'

/** How much of a failing answer's body its error keeps, after secrets are blanked out of it. */
const causeBodyLength = 200

const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
const textRecord = { type: 'object', additionalProperties: { type: 'string' } }

const invalid = (reason: string) => new StepError('Http.InvalidArguments', reason)

// Where `store` puts the answer's body: a configuration and, when given, a path in it.
const storeOf = (input: Record<string, unknown>) => {
  if (input.store === undefined) return
  const { configuration, path } = input.store as { configuration?: unknown; path?: unknown }
  if (typeof configuration !== 'string') throw invalid('store.configuration is the name of a storage configuration')
  if (path !== undefined && typeof path !== 'string') throw invalid('store.path is text')
  if (input.response !== undefined) throw invalid('store keeps the body as a stored file: give no response with it')
  return { configuration, ...(path !== undefined && { path }) }
}

const checked = (input: Record<string, unknown>) => {
  if (typeof input.url !== 'string' || !URL.canParse(input.url)) throw invalid('url must be an http or https URL')
  const method = input.method === undefined ? 'GET' : String(input.method).toUpperCase()
  if (!methods.includes(method)) throw invalid(`method must be one of ${methods.join(', ')}`)
  const url = new URL(input.url)
  for (const [name, value] of Object.entries((input.query ?? {}) as Record<string, string>)) url.searchParams.append(name, value)
  return { url, method, headers: new Headers(input.headers as Record<string, string> | undefined), reading: input.response as Reading | undefined, store: storeOf(input) }
}

const requestBody = async (given: unknown, method: string, headers: Headers, { files }: StepContext) => {
  if (given === undefined || method === 'GET') return
  if (isFileValue(given)) {
    const file = await files.read(given, 'body')
    if (!headers.has('content-type')) headers.set('content-type', file.type ?? 'application/octet-stream')
    return file.bytes
  }
  if (typeof given === 'string') return given
  if (!headers.has('content-type')) headers.set('content-type', 'application/json')
  return JSON.stringify(given)
}

// The file name in the URL's last segment, kept as it is when an escape in it does not decode, such as `a%zz`.
const fileName = (url: URL) => {
  const segment = url.pathname.slice(url.pathname.lastIndexOf('/') + 1)
  try {
    return decodeURIComponent(segment)
  } catch (error) {
    if (!(error instanceof URIError)) throw error
    return segment
  }
}

type Reading = 'json' | 'text' | 'file'

// Types whose body is text though they are not text/*.
const textualTypes = new Set(['application/xml', 'application/javascript', 'application/ecmascript', 'application/x-www-form-urlencoded', 'application/yaml', 'application/x-yaml', 'application/toml', 'application/x-ndjson'])

/** How an answer of this Content-Type is read without a `response`: JSON, text, or a file for any other type or none. */
const readingOf = (type: string | undefined): Reading => {
  if (type === undefined) return 'file'
  if (type === 'application/json' || type.endsWith('+json')) return 'json'
  if (type.startsWith('text/') || type.endsWith('+xml') || type.endsWith('+yaml') || textualTypes.has(type)) return 'text'
  return 'file'
}

// The answer's body as `response` says, else by its Content-Type (see readingOf) with an empty body null: parsed
// JSON (null when empty), text, or a file the run keeps.
const answerBody = async (bytes: Uint8Array, given: Reading | undefined, url: URL, header: string | null, { files }: StepContext) => {
  const type = header?.split(';')[0]?.trim().toLowerCase() || undefined
  if (given === undefined && bytes.length === 0) return null
  const reading = given ?? readingOf(type)
  if (reading === 'file') return files.keep(bytes, fileName(url), type ?? 'application/octet-stream')
  const text = new TextDecoder().decode(bytes)
  if (reading === 'text') return text
  if (text.trim() === '') return null
  try {
    return JSON.parse(text) as unknown
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error
    const said = given === undefined ? ` ${type}` : ''
    throw new StepError('Http.InvalidBody', `${url.host} answered${said} with a body that is not JSON; read it with "response": "text"`)
  }
}

// The start of a failing answer's body, read as far as the cause keeps, the rest left unread.
const excerptOf = async (answer: Response, redact: (text: string) => string) => {
  if (!answer.body) return ''
  const reader = answer.body.getReader()
  const read = await reader.read()
  await reader.cancel()
  return read.done ? '' : redact(new TextDecoder().decode(read.value.subarray(0, causeBodyLength * 4))).slice(0, causeBodyLength)
}

// An answer streamed straight into storage: its body is never held here, whatever its size.
const storedAnswer = async (answer: Response, target: StorageTarget, url: URL, context: StepContext, started: number) => {
  const { input, log, redact } = context
  log(`${String(input.method ?? 'GET').toUpperCase()} ${loggedUrl(input.url as string)}: ${answer.status} in ${Date.now() - started} ms`)
  if (answer.status < 200 || answer.status > 299) {
    const excerpt = await excerptOf(answer, redact)
    throw new StepError('Http.Status', `${url.host} answered ${answer.status}${excerpt ? `: ${excerpt}` : ''}`)
  }
  const type = answer.headers.get('content-type')?.split(';')[0]?.trim() || 'application/octet-stream'
  const body = answer.body ?? new Blob([]).stream()
  const stored = await target.put(body, { name: fileName(url), type })
  const kept = Object.fromEntries([...answer.headers].filter(([name]) => name !== 'set-cookie'))
  return { status: answer.status, headers: kept, body: stored }
}

const loggedUrl = (given: string) => given.replace(/^([^:/?#]+:\/\/)[^/?#]*@/, '$1').replace(/[?#].*$/, '')

const send = async (context: StepContext) => {
  const { input, signal, log, redact } = context
  const { url, method, headers, reading, store } = checked(input)
  // A configuration or path that cannot take the answer fails before any request leaves.
  const target = store && (await context.storage.open(store.configuration, store.path ?? (await stepPath(context))))
  const body = await requestBody(input.body, method, headers, context)
  const started = Date.now()
  const answer = await context.fetch(url.href, { method, headers, ...(body !== undefined && { body }), signal, ...(store && { stream: true }) }).catch((error: unknown) => {
    if (error instanceof AddressRefusedError) throw new StepError('Http.AddressRefused', error.message)
    if (error instanceof ResponseTooLargeError) throw new StepError('Http.ResponseTooLarge', `The answer's body is larger than ${fetchMaxBytes / 1024 / 1024} MiB, the most the http step reads`)
    if (signal.aborted) throw error
    throw new StepError('Http.Network', `No answer from ${url.host}: ${error instanceof Error ? error.message : String(error)}`)
  })
  if (target) return storedAnswer(answer, target, url, context, started)
  const bytes = new Uint8Array(await answer.arrayBuffer())
  // The URL as it was given, without its user name and password or its query: the runner blanks secrets out of logs as
  // they were written, which the parsed URL's encoding of them would hide.
  log(`${method} ${loggedUrl(input.url as string)}: ${answer.status} in ${Date.now() - started} ms`)
  if (answer.status < 200 || answer.status > 299) {
    const excerpt = redact(new TextDecoder().decode(bytes)).slice(0, causeBodyLength)
    throw new StepError('Http.Status', `${url.host} answered ${answer.status}${excerpt ? `: ${excerpt}` : ''}`)
  }
  // Cookies the receiver sets are sessions of its own, not data for later steps.
  const kept = Object.fromEntries([...answer.headers].filter(([name]) => name !== 'set-cookie'))
  return { status: answer.status, headers: kept, body: await answerBody(bytes, reading, url, answer.headers.get('content-type'), context) }
}

/**
 * `app:http`: one request to a URL built at run time, through the plugin context's guarded `fetch`, which connects only
 * to a public address it checked, follows no redirect and reads at most 10 MiB of the answer, or with `store` streams
 * the answer of any size into a storage configuration.
 */
export const httpSteps: Record<string, StepType> = {
  http: {
    label: 'HTTP request',
    description: 'Sends one HTTP request to a public address and reads the answer.',
    errorPrefix: 'Http',
    input: {
      type: 'object',
      required: ['url'],
      properties: {
        url: { type: 'string', description: 'an http or https URL' },
        method: { type: 'string', description: 'GET (default), POST, PUT, PATCH or DELETE' },
        headers: { ...textRecord, description: 'an object of text values' },
        query: { ...textRecord, description: "an object of text values, added to the URL's query" },
        body: { description: 'text sent as it is, a file value sent as its bytes, any other value sent as JSON; a GET sends none' },
        response: {
          enum: ['json', 'text', 'file'],
          description: "how the answer's body is read: by default by its Content-Type, JSON for application/json and +json, text for text/* and other textual types, a file for any other or none, and null when empty; json (empty is null), text, or file (kept as a file value of the run) reads every answer so",
        },
        store: {
          type: 'object',
          required: ['configuration'],
          description: "streams the answer's body, of any size, into a storage configuration; the body is then the stored file",
          properties: { configuration: { type: 'string', description: 'the name of a storage configuration' }, path: { type: 'string', description: 'where in it; default a path of this step in this run' } },
        },
      },
    },
    output: { type: 'object', description: '{ status, headers, body }', properties: { status: { type: 'integer' }, headers: { type: 'object' }, body: {} } },
    errors: {
      Status: 'a status outside 2xx; the cause names it with the start of the body',
      Network: 'no answer',
      InvalidArguments: 'an argument has the wrong type, named in the cause',
      InvalidBody: 'read as JSON, by response json or a JSON Content-Type, and the body is not JSON',
      AddressRefused: 'the host is not a public address',
      ResponseTooLarge: 'a body over 10 MiB, unless stored',
    },
    // Only a GET reads, as the omitted method is: any other text, even `get`, counts as a write a replay does not send.
    // Storing the answer writes too, so a resumed run keeps the file it stored and never fetches a link that may have expired.
    writes: (input) => input.store !== undefined || (input.method !== undefined && input.method !== 'GET'),
    run: send,
  },
}
