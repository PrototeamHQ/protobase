import { ConnectionError, ResponseTooLargeError, type PluginConnection, type PluginFetch } from '@protobase/workflows/plugin'

/** Gmail answered 404: an expired history id, or a message deleted since it was listed. */
export class GmailNotFound extends Error {
  override name = 'GmailNotFound'
}

/** A Gmail id as it may go into a path: letters and digits only, so no answer can steer a request elsewhere. */
export const gmailId = /^[A-Za-z0-9]{1,64}$/

/** A history id: a number, as text. */
export const historyId = /^\d{1,30}$/

// Google's canonical error codes, the values `error.status` may take; any other value and the free-text message are never kept.
const errorStatuses = new Set(['CANCELLED', 'UNKNOWN', 'INVALID_ARGUMENT', 'DEADLINE_EXCEEDED', 'NOT_FOUND', 'ALREADY_EXISTS', 'PERMISSION_DENIED', 'RESOURCE_EXHAUSTED', 'FAILED_PRECONDITION', 'ABORTED', 'OUT_OF_RANGE', 'UNIMPLEMENTED', 'INTERNAL', 'UNAVAILABLE', 'DATA_LOSS', 'UNAUTHENTICATED'])

const statusOf = (body: string) => {
  const status = (parseJson(body) as { error?: { status?: unknown } } | undefined)?.error?.status
  return typeof status === 'string' && errorStatuses.has(status) ? ` (${status})` : ''
}

// `undefined` for text that is not JSON.
const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error
    return
  }
}

export type GmailApiInput = { origin: string; fetch: PluginFetch; connection: PluginConnection | undefined; signal: AbortSignal }

/**
 * The few read-only Gmail calls the trigger makes, all GET, through the plugin context's `fetch`. The token goes only in
 * the `Authorization` header, asked for once a poll; a 401 asks for a refreshed one and tries once more, and a second 401 is an
 * expired sign-in. An error names the call and its status, never a URL, a header or Google's own message.
 */
export const gmailApi = ({ origin, fetch, connection, signal }: GmailApiInput) => {
  if (!connection) throw new Error('Not implemented: the Gmail trigger always declares its Google connection')
  let token: string | undefined

  const send = async (url: string, call: string, bearer: string, maxBytes: number | undefined) => {
    try {
      return await fetch(url, { headers: { authorization: `Bearer ${bearer}`, accept: 'application/json' }, signal, ...(maxBytes !== undefined && { maxBytes }) })
    } catch (error) {
      // Too large is the caller's to handle; a stopped worker stays a stop. Anything else keeps only its kind.
      if (error instanceof ResponseTooLargeError || signal.aborted) throw error
      throw new Error(`Gmail ${call} failed: ${error instanceof Error ? error.name : 'unknown error'}`, { cause: error })
    }
  }

  /** GET `path` with `query`, a list of names and values so a name may repeat; a value left undefined is left out. */
  const get = async (path: string, query: [string, string | undefined][], call: string, maxBytes?: number): Promise<unknown> => {
    const params = new URLSearchParams(query.filter((entry): entry is [string, string] => entry[1] !== undefined))
    const url = `${origin}/gmail/v1/users/me/${path}${params.size > 0 ? `?${params}` : ''}`
    token ??= await connection.accessToken()
    let answer = await send(url, call, token, maxBytes)
    if (answer.status === 401) {
      token = await connection.accessToken({ refresh: true })
      answer = await send(url, call, token, maxBytes)
      if (answer.status === 401) throw new ConnectionError('link_expired', 'Google refused the access token twice: sign in to the Google account again')
    }
    const text = await answer.text()
    if (answer.status === 404) throw new GmailNotFound(`Gmail ${call} found nothing`)
    if (!answer.ok) throw new Error(`Gmail ${call} answered ${answer.status}${statusOf(text)}`)
    const body = parseJson(text)
    if (typeof body !== 'object' || body === null) throw new Error(`Gmail ${call} answered no JSON object`)
    return body
  }

  return { get }
}

export type GmailApi = ReturnType<typeof gmailApi>
