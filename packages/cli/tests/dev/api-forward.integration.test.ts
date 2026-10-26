import { createServer, request, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { ViteDevServer } from 'vite'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiForward } from '../../src/dev/api-forward'

type Middleware = (request: IncomingMessage, response: ServerResponse, next: (error?: Error) => void) => void

const listen = (server: Server) => new Promise<number>((resolve) => server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port)))

// The dev server's side of apiForward: its middleware on a server of its own, with `next` as Vite's error handler.
const devServer = async (apiPort: () => Promise<number>, next: (error?: Error) => void) => {
  let middleware: Middleware | undefined
  const fake = { middlewares: { use: (handler: Middleware) => (middleware = handler) }, httpServer: null } as unknown as ViteDevServer
  const { configureServer } = apiForward(apiPort) as { configureServer: (server: ViteDevServer) => void }
  configureServer(fake)
  const server = createServer((request, response) => middleware!(request, response, (error) => {
    next(error)
    response.statusCode = error ? 500 : 404
    response.end()
  }))
  return { server, port: await listen(server) }
}

describe('apiForward', () => {
  const servers: Server[] = []
  const started = (server: Server) => (servers.push(server), server)

  afterEach(async () => {
    for (const server of servers.splice(0)) {
      server.closeAllConnections()
      await new Promise((resolve) => server.close(resolve))
    }
  })

  it("hands the API's requests to its process and its answers back, every cookie of them", async () => {
    const api = started(createServer((request, response) => {
      response.setHeader('set-cookie', ['a=1; Path=/', 'b=2; Path=/'])
      response.end(`${request.method} ${request.url} ${request.headers.host}`)
    }))
    const apiPort = await listen(api)
    const next = vi.fn()
    const dev = await devServer(async () => apiPort, next)
    started(dev.server)
    const answer = await fetch(`http://127.0.0.1:${dev.port}/api/v1/orders?x=1`, { method: 'POST', body: 'x' })
    expect(await answer.text()).toBe(`POST /api/v1/orders?x=1 127.0.0.1:${dev.port}`)
    expect(answer.headers.getSetCookie()).toEqual(['a=1; Path=/', 'b=2; Path=/'])
    expect((await fetch(`http://127.0.0.1:${dev.port}/orders`)).status).toBe(404)
    expect(next).toHaveBeenCalledTimes(1)
    expect(next).toHaveBeenCalledWith(undefined)
  })

  it('reports no error when the client leaves before the API answers, and ends its request there', async () => {
    const apiClosed = new Promise<void>((resolve) => {
      started(createServer((request) => request.on('close', () => resolve())))
    })
    const apiPort = await listen(servers.at(-1)!)
    const next = vi.fn()
    const dev = await devServer(async () => apiPort, next)
    started(dev.server)
    const client = request({ host: '127.0.0.1', port: dev.port, path: '/api/events' })
    client.on('error', () => undefined)
    client.end()
    await new Promise((resolve) => setTimeout(resolve, 100))
    client.destroy()
    await apiClosed
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(next).not.toHaveBeenCalled()
  })

  it('shows a failure to reach the API process as the dev server shows its own errors', async () => {
    const next = vi.fn()
    const dev = await devServer(async () => 1, next)
    started(dev.server)
    expect((await fetch(`http://127.0.0.1:${dev.port}/api/meta`)).status).toBe(500)
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'ECONNREFUSED' }))
  })
})
