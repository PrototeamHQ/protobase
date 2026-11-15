import type { Server, ServerResponse } from 'node:http'

/**
 * How `server` closes, given before it listens so it sees every request: it stops accepting connections and resolves
 * once every open one ended. Each request open then, and each one that comes on an open connection meanwhile, is
 * answered with `Connection: close`, and idle connections close at once; whatever is still open after `graceMs` is
 * dropped. Node's `close` alone waits for busy keep-alive connections, which a client that asks again as each answer
 * comes, as a runner's long poll does, never leaves idle.
 */
export const serverCloser = (server: Server) => {
  const open = new Set<ServerResponse>()
  let closing = false
  const last = (response: ServerResponse) => {
    if (!response.headersSent) response.setHeader('connection', 'close')
  }
  server.on('request', (_request, response: ServerResponse) => {
    if (closing) last(response)
    open.add(response)
    response.once('close', () => open.delete(response))
  })
  return (graceMs: number) =>
    new Promise<void>((resolve, reject) => {
      closing = true
      const dropping = setTimeout(() => server.closeAllConnections(), graceMs)
      server.close((error) => {
        clearTimeout(dropping)
        if (error) reject(error)
        else resolve()
      })
      for (const response of open) last(response)
      server.closeIdleConnections()
    })
}
