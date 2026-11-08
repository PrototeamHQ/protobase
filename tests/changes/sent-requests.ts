import type * as Http from 'node:http'

export type Sent = { path: string; id: string | undefined; body: string; outcome: string }

/** What webhook deliveries sent, in order, with how each send went, kept by `recordingHttp`. */
export const sent: Sent[] = []

/**
 * `node:http` whose `request` keeps what it sends in `sent`, for a test file's
 * `vi.mock('node:http', async (original) => (await import('./sent-requests')).recordingHttp(await original()))`.
 */
export const recordingHttp = (http: typeof Http) => {
  const request = (options: Http.RequestOptions, callback?: (response: Http.IncomingMessage) => void) => {
    const entry: Sent = { path: options.path ?? '/', id: (options.headers as Record<string, string> | undefined)?.['webhook-id'], body: '', outcome: 'pending' }
    sent.push(entry)
    const outgoing = http.request(options, (response) => {
      entry.outcome = String(response.statusCode)
      callback?.(response)
    })
    outgoing.on('error', (error) => void (entry.outcome = error.message))
    const end = outgoing.end.bind(outgoing) as (body?: string) => Http.ClientRequest
    outgoing.end = ((body?: string) => {
      entry.body = body ?? ''
      return end(body)
    }) as typeof outgoing.end
    return outgoing
  }
  return { ...http, request }
}
