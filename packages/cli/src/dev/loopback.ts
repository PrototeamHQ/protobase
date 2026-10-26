import type { Server as HttpServer } from 'node:http'
import { createServer, type Server } from 'node:net'

// `localhost` is 127.0.0.1 or ::1 depending on the runtime and the resolver, so the dev server holds its port on both:
// another server on either address would otherwise answer http://localhost:<port> in its place.
export const devHost = '127.0.0.1'
const loopbacks = [devHost, '::1']

// A machine without an IPv6 (or IPv4) loopback has nothing to hold there.
const missingFamily = ['EADDRNOTAVAIL', 'EAFNOSUPPORT']

const listen = (server: Server, port: number, host: string) =>
  new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      server.off('error', reject)
      resolve()
    })
  })

// Listens on `host`, refusing a port another process holds there; false when the machine has no such address.
const hold = async (server: Server, port: number, host: string) => {
  try {
    await listen(server, port, host)
    return true
  } catch (error) {
    const { code } = error as NodeJS.ErrnoException
    if (code === 'EADDRINUSE') {
      throw new Error(`Port ${port} is in use by another server on ${host}, which would answer http://localhost:${port} instead. Stop it, or run on a free port with --port`)
    }
    if (code && missingFamily.includes(code)) return false
    throw error
  }
}

/** Fails when another process holds `port` on either loopback address, before the dev server starts. */
export const checkPortFree = async (port: number) => {
  for (const host of loopbacks) {
    const probe = createServer()
    if (await hold(probe, port, host)) await new Promise((resolve) => probe.close(resolve))
  }
}

/**
 * Hands each connection to `port` on ::1 to `httpServer`, listening on 127.0.0.1, WebSocket upgrades included, until it
 * closes. Returns the server listening on ::1, undefined when the machine has no IPv6 loopback.
 */
export const alsoOnIpv6 = async (httpServer: HttpServer, port: number) => {
  const forwarder = createServer((socket) => httpServer.emit('connection', socket))
  if (!(await hold(forwarder, port, '::1'))) return undefined
  httpServer.once('close', () => forwarder.close())
  return forwarder
}
