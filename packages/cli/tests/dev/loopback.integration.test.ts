import { createServer as createHttpServer } from 'node:http'
import { createServer, type Server } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { alsoOnIpv6, checkPortFree } from '../../src/dev/loopback'
import { freePort } from '../support/database'

const servers: Server[] = []
const holdPort = (port: number, host: string) =>
  new Promise<void>((resolve, reject) => {
    const server = createServer()
    servers.push(server)
    server.once('error', reject)
    server.listen(port, host, resolve)
  })

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))))
})

describe('checkPortFree', () => {
  it('passes a port neither loopback address holds', async () => {
    await expect(checkPortFree(await freePort())).resolves.toBeUndefined()
  })

  // Another dev server on [::1] answers http://localhost in browsers that resolve it to ::1 first.
  it.each(['127.0.0.1', '::1'])('refuses a port another server holds on %s', async (host) => {
    const port = await freePort()
    await holdPort(port, host)
    await expect(checkPortFree(port)).rejects.toThrow(`Port ${port} is in use by another server on ${host}, which would answer http://localhost:${port} instead. Stop it, or run on a free port with --port`)
  })
})

describe('alsoOnIpv6', () => {
  it('answers on ::1 with the server on 127.0.0.1, and stops when it closes', async () => {
    const port = await freePort()
    const http = createHttpServer((request, response) => response.end(request.socket.localAddress))
    await new Promise<void>((resolve) => http.listen(port, '127.0.0.1', resolve))
    const forwarder = await alsoOnIpv6(http, port)
    const forwarderClosed = new Promise((resolve) => forwarder!.once('close', resolve))
    expect(await (await fetch(`http://127.0.0.1:${port}/`)).text()).toBe('127.0.0.1')
    expect(await (await fetch(`http://[::1]:${port}/`)).text()).toBe('::1')
    http.closeAllConnections()
    await new Promise((resolve) => http.close(resolve))
    await forwarderClosed
    await expect(checkPortFree(port)).resolves.toBeUndefined()
  })
})
