import { readFileSync } from 'node:fs'
import { createServer, type Server } from 'node:https'
import { isIP, type AddressInfo } from 'node:net'
import { afterAll, describe, expect, it } from 'vitest'
import { pinnedRequest, resolveHost, type Resolve } from '../../packages/server/src/webhooks/table/pinned-request'

const runtime = process.versions.bun ? 'Bun' : 'Node'
const support = (name: string) => readFileSync(new URL(`../../packages/server/tests/support/${name}`, import.meta.url))
// A certificate for the host names the requests use (hook.test and localhost), and a self-signed one for another host.
const hookTls = { key: support('hook-test.key'), cert: support('hook-test.crt') }
const otherTls = { key: support('saml-idp.key'), cert: support('saml-idp.crt') }

const servers: Server[] = []
afterAll(() => {
  for (const server of servers) {
    server.closeAllConnections()
    server.close()
  }
})

const listening = async (tls: { key: Buffer; cert: Buffer }, host = '127.0.0.1') => {
  const seen: { host: string | undefined; servername: string | undefined; to: string | undefined }[] = []
  const server = createServer(tls, (request, response) => {
    const socket = request.socket as import('node:tls').TLSSocket
    seen.push({ host: request.headers.host, servername: (socket as { servername?: string | false }).servername || undefined, to: socket.localAddress })
    response.end('ok')
  })
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, host, resolve))
  return { port: (server.address() as AddressInfo).port, seen }
}

const counting = (address: string) => {
  const asked: string[] = []
  const resolve: Resolve = async (host) => {
    asked.push(host)
    return [address]
  }
  return { resolve, asked }
}

// The pinned request on the runtime that runs this test (`bun run test:smoke` or `node --run test:smoke`), as webhook
// deliveries make it on the serve runtime.
describe(`a pinned HTTPS request on ${runtime}`, () => {
  it('reaches the checked address, resolved once, with the host name as Host header and TLS server name', async () => {
    const server = await listening(hookTls)
    const { resolve, asked } = counting('127.0.0.1')
    const response = await pinnedRequest(`https://hook.test:${server.port}/in`, { method: 'POST', body: '{}' }, { resolve, allowPrivateAddresses: true, ca: hookTls.cert })
    expect([response.status, await response.text()]).toEqual([200, 'ok'])
    expect(asked).toEqual(['hook.test'])
    expect(server.seen).toEqual([{ host: `hook.test:${server.port}`, servername: 'hook.test', to: '127.0.0.1' }])
  })

  it('refuses a server whose certificate names another host, sending nothing', async () => {
    const server = await listening(otherTls)
    const { resolve } = counting('127.0.0.1')
    await expect(pinnedRequest(`https://hook.test:${server.port}/in`, { method: 'POST', body: '{}' }, { resolve, allowPrivateAddresses: true, ca: otherTls.cert })).rejects.toThrow()
    expect(server.seen).toEqual([])
  })

  it('resolves through the system resolver when none is given, and connects to the first address it answers', async () => {
    const addresses = await resolveHost('localhost')
    expect(addresses.every((address) => isIP(address) !== 0)).toBe(true)
    const server = await listening(hookTls, addresses[0])
    const response = await pinnedRequest(`https://localhost:${server.port}/in`, { method: 'GET' }, { allowPrivateAddresses: true, ca: hookTls.cert })
    expect(response.status).toBe(200)
    expect(server.seen).toEqual([{ host: `localhost:${server.port}`, servername: 'localhost', to: expect.stringContaining(addresses[0]!) }])
  })
})
