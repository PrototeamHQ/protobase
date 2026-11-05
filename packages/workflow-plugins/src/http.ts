import { AddressRefusedError, fetchMaxBytes, isFileValue, ResponseTooLargeError, StepError, type StepContext, type StepType } from '@protobase/workflows/plugin'

/** How much of a failing answer's body its error keeps, after secrets are blanked out of it. */
const causeBodyLength = 200

const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
const textRecord = { type: 'object', additionalProperties: { type: 'string' } }

const invalid = (reason: string) => new StepError('Http.InvalidArguments', reason)

const checked = (input: Record<string, unknown>) => {
  if (typeof input.url !== 'string' || !URL.canParse(input.url)) throw invalid('url must be an http or https URL')
  const method = input.method === undefined ? 'GET' : String(input.method).toUpperCase()
  if (!methods.includes(method)) throw invalid(`method must be one of ${methods.join(', ')}`)
  const url = new URL(input.url)
  for (const [name, value] of Object.entries((input.query ?? {}) as Record<string, string>)) url.searchParams.append(name, value)
  return { url, method, headers: new Headers(input.headers as Record<string, string> | undefined), reading: (input.response ?? 'json') as string }
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

// The answer's body as `response` says: parsed JSON (null when empty), text, or a file the run keeps.
const answerBody = async (bytes: Uint8Array, reading: string, url: URL, type: string | null, { files }: StepContext) => {
  if (reading === 'file') return files.keep(bytes, decodeURIComponent(url.pathname.slice(url.pathname.lastIndexOf('/') + 1)), type?.split(';')[0]?.trim() || 'application/octet-stream')
  const text = new TextDecoder().decode(bytes)
  if (reading === 'text') return text
  if (text.trim() === '') return null
  try {
    return JSON.parse(text) as unknown
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error
    throw new StepError('Http.InvalidBody', `${url.host} answered with a body that is not JSON; read it with "response": "text"`)
  }
}

const send = async (context: StepContext) => {
  const { input, signal, log, redact } = context
  const { url, method, headers, reading } = checked(input)
  const body = await requestBody(input.body, method, headers, context)
  const started = Date.now()
  const answer = await context.fetch(url.href, { method, headers, ...(body !== undefined && { body }), signal }).catch((error: unknown) => {
    if (error instanceof AddressRefusedError) throw new StepError('Http.AddressRefused', error.message)
    if (error instanceof ResponseTooLargeError) throw new StepError('Http.ResponseTooLarge', `The answer's body is larger than ${fetchMaxBytes / 1024 / 1024} MiB, the most the http step reads`)
    if (signal.aborted) throw error
    throw new StepError('Http.Network', `No answer from ${url.host}: ${error instanceof Error ? error.message : String(error)}`)
  })
  const bytes = new Uint8Array(await answer.arrayBuffer())
  // The URL as it was given, without its query: the runner blanks secrets out of logs as they were written, which the
  // parsed URL's encoding of them would hide.
  log(`${method} ${input.url as string}`.replace(/[?#].*$/, '') + `: ${answer.status} in ${Date.now() - started} ms`)
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
 * to a public address it checked, follows no redirect and reads at most 10 MiB of the answer.
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
        response: { enum: ['json', 'text', 'file'], description: "how the answer's body is read: json (default; empty is null), text, or file (kept as a file value of the run)" },
      },
    },
    output: { type: 'object', description: '{ status, headers, body }', properties: { status: { type: 'integer' }, headers: { type: 'object' }, body: {} } },
    errors: {
      Status: 'a status outside 2xx; the cause names it with the start of the body',
      Network: 'no answer',
      InvalidArguments: 'an argument has the wrong type, named in the cause',
      InvalidBody: 'response json, and the body is not JSON',
      AddressRefused: 'the host is not a public address',
      ResponseTooLarge: 'a body over 10 MiB',
    },
    run: send,
  },
}
