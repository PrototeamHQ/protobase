import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createServer } from 'node:https'
import type { AddressInfo } from 'node:net'

type Handler = (request: Request) => Promise<Response> | Response

const toRequest = async (incoming: IncomingMessage, scheme: 'http' | 'https') => {
  const chunks: Buffer[] = []
  for await (const chunk of incoming) chunks.push(chunk as Buffer)
  const headers = new Headers()
  for (const [name, value] of Object.entries(incoming.headers)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) headers.append(name, item)
  }
  const body = incoming.method === 'GET' || incoming.method === 'HEAD' ? undefined : Buffer.concat(chunks)
  return new Request(`${scheme}://${incoming.headers.host}${incoming.url}`, { method: incoming.method!, headers, ...(body && { body }) })
}

const send = async (response: Response, outgoing: ServerResponse) => {
  const headers: Record<string, string | string[]> = {}
  for (const [name, value] of response.headers) if (name !== 'set-cookie') headers[name] = value
  const cookies = response.headers.getSetCookie()
  if (cookies.length > 0) headers['set-cookie'] = cookies
  outgoing.writeHead(response.status, headers)
  outgoing.end(Buffer.from(await response.arrayBuffer()))
}

/**
 * A server on a free loopback port, HTTPS with `tls` and plain HTTP without, so its port is known before the app it
 * serves is made: `use` sets the handler. Every request's method and path is kept, by host, in `requests`.
 */
const startServer = async (tls?: { key: Buffer; cert: Buffer }) => {
  let handler: Handler = () => new Response('Not ready', { status: 503 })
  const requests: string[] = []
  const listener = (incoming: IncomingMessage, outgoing: ServerResponse) => {
    requests.push(`${incoming.method === 'GET' ? '' : `${incoming.method} `}${incoming.headers.host}${incoming.url}`)
    void toRequest(incoming, tls ? 'https' : 'http')
      .then(handler)
      .then((response) => send(response, outgoing))
  }
  const server = tls ? createServer(tls, listener) : createHttpServer(listener)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return {
    port: (server.address() as AddressInfo).port,
    requests,
    use: (next: Handler) => {
      handler = next
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

/** An HTTPS server on a free loopback port (see `startServer`). */
export const startHttpsServer = (tls: { key: Buffer; cert: Buffer }) => startServer(tls)

/** A plain HTTP server on a free loopback port (see `startServer`). */
export const startHttpServer = () => startServer()
