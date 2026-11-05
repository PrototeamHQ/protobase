import type { FileValue, WebhookEvent } from '@protobase/workflows/plugin'

/** The largest body a run keeps in its input; a larger one is a file of the run. */
export const inlineBodyBytes = 1024 * 1024

// Credentials and what the proxies in front added: no run, step or log sees them.
const dropped = (name: string, signatureHeader: string | undefined) =>
  name === 'authorization' || name === 'proxy-authorization' || name === 'cookie' || name.startsWith('webhook-') || name.startsWith('x-forwarded-') || name === 'forwarded' || name === signatureHeader

/** The call's headers without its credentials, lower-cased as `Headers` keeps them, so no case of a name gets through. */
export const keptHeaders = (headers: Headers, signatureHeader: string | undefined) => {
  const signature = signatureHeader?.toLowerCase()
  return Object.fromEntries([...headers].filter(([name]) => !dropped(name, signature)))
}

const isJson = (type: string) => /^application\/([\w.+-]+\+)?json\b/i.test(type)

// The body as JSON when it says so and parses, as form fields, or as text.
const parsedBody = (bytes: Uint8Array, type: string) => {
  const text = new TextDecoder().decode(bytes)
  if (isJson(type)) {
    try {
      return JSON.parse(text) as unknown
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error
      return text
    }
  }
  if (/^application\/x-www-form-urlencoded\b/i.test(type)) return Object.fromEntries(new URLSearchParams(text))
  return text
}

/**
 * The call as its run sees it: method, query, headers without credentials, the body, or `file` when the body is over
 * 1 MiB and the caller kept it as a file of the run, and when it came. The address is left out: it holds the key.
 */
export const hookEvent = (request: Request, bytes: Uint8Array, signatureHeader: string | undefined, file?: FileValue): WebhookEvent => ({
  method: request.method,
  query: Object.fromEntries(new URL(request.url).searchParams),
  headers: keptHeaders(request.headers, signatureHeader),
  body: file ?? parsedBody(bytes, request.headers.get('content-type') ?? ''),
  received_at: new Date().toISOString(),
})

/** The same call for a plugin's `receive`: the headers without credentials, the bytes read, and no key in its address. */
export const receivedRequest = (request: Request, bytes: Uint8Array, signatureHeader: string | undefined) => {
  const url = new URL(request.url)
  return new Request(`${url.origin}/?${url.searchParams}`, { method: request.method, headers: keptHeaders(request.headers, signatureHeader), body: bytes as BodyInit })
}
