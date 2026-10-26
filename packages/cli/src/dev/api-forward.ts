import { request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http'
import { connect } from 'node:net'
import { pipeline, type Duplex } from 'node:stream'
import type { Plugin } from 'vite'
import { apiUpgrades } from './api-websockets'
import { devHost } from './loopback'

/**
 * The requests the API process answers: everything under /api, the passkey origins at /.well-known/webauthn, the OAuth
 * discovery documents MCP clients read (`oauthWellKnownPaths`), below which a resource's own one is, and the push worker
 * (`withDevServiceWorker`). Vite serves the rest.
 */
export const isApiRequest = (url: string) =>
  /^(\/api(\/|\?|$)|\/\.well-known\/webauthn(\?|$)|\/\.well-known\/oauth-(authorization-server|protected-resource)(\/|\?|$)|\/protobase\.sw\.js(\?|$))/.test(url)

// Headers of one connection, which the dev server sets for its own.
const hopByHop = new Set(['connection', 'keep-alive', 'transfer-encoding'])

// A connection of its own for each request: a kept-alive one that the API process's server closes as idle while it is
// handed the next request fails that request with "socket hang up".
const forwardRequest = (port: number, request: IncomingMessage, response: ServerResponse, next: (error: Error) => void) => {
  let answered = false
  let left = false
  const upstream = httpRequest({ host: devHost, port, method: request.method, path: request.url, headers: request.headers, agent: false }, (answer) => {
    answered = true
    const headers = Object.fromEntries(Object.entries(answer.headers).filter(([name]) => !hopByHop.has(name)))
    response.writeHead(answer.statusCode!, answer.statusMessage, headers)
    // An answer cut off midway, by either side, reaches the client cut off; the API process reports its own errors.
    pipeline(answer, response, () => undefined)
  })
  // A client that goes away, such as a closed page with an open event stream, ends the API's request too.
  response.on('close', () => {
    left = true
    upstream.destroy()
  })
  // Until the API process answers, a failure is the dev server's to show, unless the client already left.
  upstream.on('error', (error) => {
    if (!answered && !left) next(error)
  })
  request.pipe(upstream)
}

// Replays the upgrade request on a connection to the API process, then joins the two sockets.
const forwardUpgrade = (port: number, request: IncomingMessage, socket: Duplex, head: Buffer) => {
  const upstream = connect(port, devHost, () => {
    const lines = [`${request.method} ${request.url} HTTP/${request.httpVersion}`]
    for (let i = 0; i < request.rawHeaders.length; i += 2) lines.push(`${request.rawHeaders[i]}: ${request.rawHeaders[i + 1]}`)
    upstream.write(`${lines.join('\r\n')}\r\n\r\n`)
    if (head.length > 0) upstream.write(head)
    socket.pipe(upstream).pipe(socket)
  })
  upstream.on('error', () => socket.destroy())
  socket.on('error', () => upstream.destroy())
}

/**
 * Hands the API's requests and WebSockets to the API process on `port` once it is ready, after Vite's host check and
 * CORS as before; a request that comes while it starts waits for it.
 */
export const apiForward = (port: () => Promise<number>): Plugin => ({
  name: 'protobase-api-forward',
  configureServer: (server) => {
    server.middlewares.use((request, response, next) => {
      if (!isApiRequest(request.url ?? '')) return next()
      port().then((ready) => forwardRequest(ready, request, response, next), next)
    })
    const upgrade = (request: IncomingMessage, socket: Duplex, head: Buffer) => port().then((ready) => forwardUpgrade(ready, request, socket, head), () => socket.destroy())
    server.httpServer?.on('upgrade', apiUpgrades(() => server.config.server.allowedHosts, (request, socket, head) => void upgrade(request, socket, head)))
  },
})
