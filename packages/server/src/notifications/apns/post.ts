import type { ClientHttp2Session } from 'node:http2'

/** What APNs answered a request: its status, the reason it gave and its `retry-after`, or `undefined` for no answer. */
export type ApnsAnswer = { status: number; reason?: string; retryAfter?: string } | undefined

/** How long APNs has to answer before the device is answered `retry`. */
export const defaultApnsTimeoutMs = 10_000

// APNs answers a failure with a short JSON `{ "reason": ... }`; anything past this is not read.
const maxAnswerBytes = 4096

const reasonOf = (body: string) => {
  if (body === '') return
  const parsed: unknown = JSON.parse(body)
  const reason = (parsed as { reason?: unknown } | null)?.reason
  return typeof reason === 'string' ? reason : undefined
}

// The errors that mean the request got no answer: `node:http2`'s and the network's, each with a code, such as a
// closed session, a refused connection or a certificate that does not verify.
const isTransient = (error: unknown) => typeof (error as { code?: unknown } | null)?.code === 'string'

/**
 * Posts one request on `session` and answers what APNs said, or `undefined` when no answer came, within the timeout or
 * at all. Errors of the request are never passed on, since they can name the device's path: one that is not a
 * missing answer becomes an error of its own.
 */
export const postApns = (session: ClientHttp2Session, path: string, headers: Record<string, string>, body: string, timeoutMs = defaultApnsTimeoutMs) =>
  new Promise<ApnsAnswer>((resolve, reject) => {
    const failed = (error: unknown) => (isTransient(error) ? resolve(undefined) : reject(new Error('An APNs request failed unexpectedly')))
    let stream: ReturnType<ClientHttp2Session['request']>
    try {
      stream = session.request({ ':method': 'POST', ':path': path, 'content-type': 'application/json', ...headers })
    } catch (error) {
      return failed(error)
    }
    let status = 0
    let retryAfter: string | undefined
    const chunks: Buffer[] = []
    let size = 0
    stream.setTimeout(timeoutMs, () => {
      stream.close()
      resolve(undefined)
    })
    stream.on('response', (answer) => {
      status = Number(answer[':status'])
      const header = answer['retry-after']
      retryAfter = typeof header === 'string' ? header : undefined
    })
    stream.on('data', (chunk: Buffer) => {
      if (size >= maxAnswerBytes) return
      chunks.push(chunk)
      size += chunk.length
    })
    stream.on('end', () => {
      if (status === 0) return resolve(undefined)
      const text = Buffer.concat(chunks).subarray(0, maxAnswerBytes).toString()
      let reason: string | undefined
      try {
        reason = reasonOf(text)
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error
      }
      resolve({ status, ...(reason !== undefined && { reason }), ...(retryAfter !== undefined && { retryAfter }) })
    })
    stream.on('error', failed)
    // A stream closed without `end` or `error` got no answer; after either one, the promise is already settled.
    stream.on('close', () => resolve(undefined))
    stream.end(body)
  })
