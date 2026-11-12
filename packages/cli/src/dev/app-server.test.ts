import { mkdtempSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ViteDevServer } from 'vite'
import { apiForward } from './api-forward'
import { createAppServer } from './app-server'
import { devHost } from './loopback'

// Stands in for the API process, answering preflights as `protobase serve` does for an app with a mobile section.
const allowed = 'capacitor://localhost'
const stubApi = () =>
  createServer((request, response) => {
    const origin = request.headers.origin
    response.writeHead(204, origin === allowed ? { 'access-control-allow-origin': origin, vary: 'Origin' } : { vary: 'Origin' }).end()
  })

const listen = (server: Server) => new Promise<number>((resolve) => server.listen(0, devHost, () => resolve((server.address() as AddressInfo).port)))

describe('the dev server', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'protobase-app-server-'))
  const api = stubApi()
  const front = createServer()
  let vite: ViteDevServer
  let url: string

  beforeAll(async () => {
    const apiPort = await listen(api)
    vite = await createAppServer({ appDir: dir, projectDir: dir, extensions: [], port: 0, cacheDir: path.join(dir, '.vite'), allowedHosts: [] }, [apiForward(() => Promise.resolve(apiPort))])
    front.on('request', vite.middlewares)
    url = `http://${devHost}:${await listen(front)}`
  })

  afterAll(async () => {
    await vite.close()
    front.close()
    api.close()
    rmSync(dir, { recursive: true, force: true })
  })

  const preflight = (origin: string) =>
    fetch(`${url}/api/v1/meta`, { method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'GET', 'access-control-request-headers': 'authorization' } })

  it('leaves an API preflight to the API, which allows the mobile app', async () => {
    const response = await preflight(allowed)
    expect(response.headers.get('access-control-allow-origin')).toBe(allowed)
  })

  it('gives an origin the API refuses no allow header', async () => {
    for (const origin of ['https://evil.example.com', 'http://localhost:3000']) {
      const response = await preflight(origin)
      expect(response.headers.get('access-control-allow-origin')).toBeNull()
    }
  })
})
