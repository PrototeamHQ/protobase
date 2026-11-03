import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, describe, expect, it } from 'vitest'
import { AddressRefusedError, pinnedRequest, type Resolve } from './pinned-request'

type Seen = { path: string; headers: IncomingHttpHeaders; body: string }

const servers: Server[] = []
afterAll(() => {
  for (const server of servers) {
    server.closeAllConnections()
    server.close()
  }
})

// A local server on `host` that keeps what reaches it and answers `answer`.
const listen = async (host: string, answer: (response: import('node:http').ServerResponse) => void = (response) => void response.end('ok')) => {
  const seen: Seen[] = []
  const server = createServer((request, response) => {
    let body = ''
    request.on('data', (chunk) => (body += chunk))
    request.on('end', () => {
      seen.push({ path: request.url ?? '/', headers: request.headers, body })
      answer(response)
    })
  })
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, host, resolve))
  return { port: (server.address() as AddressInfo).port, seen }
}

// A resolver that answers each call with the next list, and counts the calls.
const answering = (...lists: string[][]) => {
  const asked: string[] = []
  const resolve: Resolve = async (host) => {
    asked.push(host)
    return lists[Math.min(asked.length - 1, lists.length - 1)]!
  }
  return { resolve, asked }
}

const post = { method: 'POST', headers: { authorization: 'Bearer secret-token' }, body: '{"secret":"payload"}' }

describe('pinnedRequest', () => {
  it('connects to the address it resolved, once, with the host name as the Host header', async () => {
    const checked = await listen('127.0.0.1')
    const { resolve, asked } = answering(['127.0.0.1'], ['127.0.0.2'])
    const response = await pinnedRequest(`http://hook.test:${checked.port}/in?a=1`, post, { resolve, allowPrivateAddresses: true })
    expect([response.status, await response.text()]).toEqual([200, 'ok'])
    expect(asked).toEqual(['hook.test'])
    expect(checked.seen).toEqual([{ path: '/in?a=1', headers: expect.objectContaining({ host: `hook.test:${checked.port}`, authorization: 'Bearer secret-token', 'content-length': '20' }), body: '{"secret":"payload"}' }])
  })

  it('never reaches the private address a host answers the second time (DNS rebinding)', async () => {
    const own = await listen('127.0.0.1')
    const { resolve, asked } = answering(['192.0.2.1'], ['127.0.0.1'])
    await expect(pinnedRequest(`http://rebind.test:${own.port}/`, { ...post, signal: AbortSignal.timeout(300) }, { resolve })).rejects.toThrow()
    expect(asked).toEqual(['rebind.test'])
    expect(own.seen).toEqual([])
  })

  it('refuses a host with a private address among its addresses, naming the host but no header or body', async () => {
    const own = await listen('127.0.0.1')
    for (const addresses of [['10.0.0.1'], ['93.184.216.34', '127.0.0.1'], ['93.184.216.34', '::ffff:7f00:1'], ['::ffff:127.0.0.1'], ['0.0.0.0'], ['::'], ['169.254.169.254'], ['fd00::1'], ['fe80::1'], ['::ffff:10.0.0.1'], ['100.64.0.1'], ['224.0.0.1'], ['240.0.0.1'], ['255.255.255.255']]) {
      const error = await pinnedRequest(`http://hook.test:${own.port}/`, post, { resolve: answering(addresses).resolve }).catch((caught: unknown) => caught)
      expect(error).toBeInstanceOf(AddressRefusedError)
      expect((error as Error).message).toMatch(/^hook\.test is a private address/)
      expect((error as Error).message).not.toMatch(/secret/)
    }
    expect(own.seen).toEqual([])
  })

  it('fails closed when the resolver fails, answers nothing or not an address, or the signal ends first', async () => {
    const failing: Resolve = async () => {
      throw new Error('getaddrinfo ENOTFOUND hook.test')
    }
    await expect(pinnedRequest('http://hook.test/', post, { resolve: failing })).rejects.toThrow('ENOTFOUND hook.test')
    await expect(pinnedRequest('http://hook.test/', post, { resolve: async () => [] })).rejects.toThrow('hook.test resolves to no address')
    await expect(pinnedRequest('http://hook.test/', post, { resolve: async () => ['hook.test'], allowPrivateAddresses: true })).rejects.toThrow('hook.test resolves to something that is not an IP address')
    const never: Resolve = () => new Promise(() => {})
    await expect(pinnedRequest('http://hook.test/', { ...post, signal: AbortSignal.timeout(20) }, { resolve: never })).rejects.toThrow()
  })

  it('checks an IP-literal URL as it stands, in any spelling, without asking the resolver', async () => {
    const { resolve, asked } = answering(['93.184.216.34'])
    const literals = [
      '127.0.0.1', '127.0.0.2', '127.1', '2130706433', '0x7f000001', '0177.0.0.1', '0.0.0.0', '10.0.0.1', '169.254.169.254', '169.254.0.1', '100.64.0.1',
      '224.0.0.1', '240.0.0.1', '255.255.255.255', '[::]', '[::1]', '[::ffff:127.0.0.1]', '[::ffff:10.0.0.1]', '[::ffff:192.168.0.1]', '[::ffff:169.254.169.254]',
      '[fc00::1]', '[fd00::1]', '[fe80::1]', '[64:ff9b::a00:1]', '[2002:a00:1::1]', 'trusted.example@169.254.169.254', 'trusted.example@10.0.0.1',
    ]
    for (const host of literals) {
      const error = await pinnedRequest(`http://${host}/`, post, { resolve }).catch((caught: unknown) => caught)
      expect([host, error instanceof AddressRefusedError && /is a private address/.test(error.message)]).toEqual([host, true])
      expect((error as Error).message).not.toContain('trusted.example')
    }
    expect(asked).toEqual([])
  })

  it('refuses a scheme other than http and https', async () => {
    await expect(pinnedRequest('file:///etc/passwd', post)).rejects.toThrow(AddressRefusedError)
  })

  it.each([
    ['public', 'https://93.184.216.34/next'],
    ['private', 'http://169.254.169.254/latest/meta-data'],
  ])('returns a redirect to a %s address as it is, and follows it nowhere', async (_kind, location) => {
    const redirecting = await listen('127.0.0.1', (response) => void response.writeHead(302, { location }).end())
    const { resolve, asked } = answering(['127.0.0.1'])
    const response = await pinnedRequest(`http://hook.test:${redirecting.port}/`, post, { resolve, allowPrivateAddresses: true })
    expect([response.status, response.headers.get('location')]).toEqual([302, location])
    expect(asked).toEqual(['hook.test'])
    expect(redirecting.seen).toHaveLength(1)
  })

  it('answers a status without a body', async () => {
    const empty = await listen('127.0.0.1', (response) => void response.writeHead(204).end())
    const response = await pinnedRequest(`http://127.0.0.1:${empty.port}/`, post, { allowPrivateAddresses: true })
    expect([response.status, response.body]).toEqual([204, null])
  })
})
