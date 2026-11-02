import { createServer, type Server } from 'node:http'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer as createVite, type ViteDevServer } from 'vite'
import { WebSocket, WebSocketServer } from 'ws'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { checkRemoteApi } from '../../src/dev/check-remote-api'
import { remoteApi } from '../../src/dev/remote-api'

const listen = (server: Server) => new Promise<number>((resolve) => server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port)))

// An instance's API as the dev server sees it: it echoes what it was sent, sets a cookie for its own domain and
// redirects to its own address.
const instance = () =>
  createServer((request, response) => {
    if (request.url === '/api/meta') return response.writeHead(200, { 'x-meta-version': '1' }).end('{}')
    if (request.url === '/api/auth/redirect') return response.writeHead(302, { location: `http://${request.headers.host}/api/auth/done?x=1` }).end()
    response.setHeader('set-cookie', ['session=1; Domain=app.example.com; Path=/; HttpOnly; SameSite=Lax'])
    response.end(JSON.stringify({ url: request.url, host: request.headers.host, origin: request.headers.origin, referer: request.headers.referer }))
  })

describe('remoteApi', () => {
  let upstream: Server
  let origin: string
  let vite: ViteDevServer
  let dev: string
  let root: string

  beforeAll(async () => {
    upstream = instance()
    const sockets = new WebSocketServer({ server: upstream })
    sockets.on('connection', (socket, request) => socket.send(`${request.url} ${request.headers.origin}`))
    origin = `http://127.0.0.1:${await listen(upstream)}`
    root = await mkdtemp(path.join(tmpdir(), 'protobase-remote-api-'))
    await writeFile(path.join(root, 'index.html'), '<!doctype html><title>app</title>')
    vite = await createVite({ root, configFile: false, logLevel: 'silent', server: { host: '127.0.0.1', port: 0, hmr: false }, plugins: [remoteApi(origin)] })
    await vite.listen()
    dev = `127.0.0.1:${(vite.httpServer!.address() as AddressInfo).port}`
  })

  afterAll(async () => {
    await vite.close()
    upstream.closeAllConnections()
    await new Promise((resolve) => upstream.close(resolve))
    await rm(root, { recursive: true, force: true })
  })

  it("hands the API's requests to the instance as its own origin's, and its cookies back for localhost", async () => {
    const answer = await fetch(`http://${dev}/api/v1/orders?x=1`, { method: 'POST', body: '{}', headers: { origin: `http://${dev}`, referer: `http://${dev}/orders?page=2` } })
    expect(await answer.json()).toEqual({ url: '/api/v1/orders?x=1', host: origin.slice('http://'.length), origin, referer: `${origin}/orders?page=2` })
    expect(answer.headers.getSetCookie()).toEqual(['session=1; Path=/; HttpOnly; SameSite=Lax'])
  })

  it("keeps the origin of another site's page, so the instance can refuse it", async () => {
    const answer = await fetch(`http://${dev}/api/v1/orders`, { method: 'POST', body: '{}', headers: { origin: 'https://evil.example', referer: 'https://evil.example/' } })
    expect(await answer.json()).toMatchObject({ origin: 'https://evil.example', referer: 'https://evil.example/' })
  })

  it("answers a redirect to the instance's own address as a path on the dev server", async () => {
    const answer = await fetch(`http://${dev}/api/auth/redirect`, { redirect: 'manual' })
    expect(answer.status).toBe(302)
    expect(answer.headers.get('location')).toBe('/api/auth/done?x=1')
  })

  it('leaves the app to Vite', async () => {
    expect(await (await fetch(`http://${dev}/orders/7`)).text()).toContain('<title>app</title>')
  })

  it("hands the API's sockets to the instance, as its own origin's", async () => {
    const socket = new WebSocket(`ws://${dev}/api/channels?x=1`, { origin: `http://${dev}` })
    const message = await new Promise<string>((resolve, reject) => {
      socket.once('message', (data) => resolve(String(data)))
      socket.once('error', reject)
    })
    socket.close()
    expect(message).toBe(`/api/channels?x=1 ${origin}`)
  })

  it('refuses a socket whose Host fails the host check', async () => {
    const socket = new WebSocket(`ws://${dev}/api/channels`, { headers: { host: 'rebound.example.com' } })
    const status = await new Promise<number | undefined>((resolve) => socket.once('unexpected-response', (_request, response) => resolve(response.statusCode)))
    expect(status).toBe(404)
  })
})

describe('checkRemoteApi', () => {
  it('passes a Protobase API and names what fails otherwise', async () => {
    const upstream = instance()
    const port = await listen(upstream)
    await expect(checkRemoteApi(`http://127.0.0.1:${port}`)).resolves.toBeUndefined()
    const other = createServer((_request, response) => response.writeHead(404).end())
    const otherPort = await listen(other)
    await expect(checkRemoteApi(`http://127.0.0.1:${otherPort}`)).rejects.toThrow('answered http://127.0.0.1:' + otherPort + '/api/meta with 404 and no X-Meta-Version header')
    await new Promise((resolve) => other.close(resolve))
    upstream.closeAllConnections()
    await new Promise((resolve) => upstream.close(resolve))
    await expect(checkRemoteApi(`http://127.0.0.1:${port}`)).rejects.toThrow(`Cannot reach the API at http://127.0.0.1:${port}/api/meta: `)
  })
})
