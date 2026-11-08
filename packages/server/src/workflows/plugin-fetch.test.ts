import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { gzipSync } from 'node:zlib'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AddressRefusedError, ResponseTooLargeError } from '@protobase/workflows/plugin'
import { pluginFetch } from './plugin-fetch'

// 50 MiB of zeros, sent as about 50 KiB of gzip: decoded, it would pass any cap the wire bytes keep to.
const bomb = gzipSync(Buffer.alloc(50 * 1024 * 1024))

describe("the plugin context's fetch", () => {
  let server: Server
  let port: number
  const received: string[] = []

  beforeAll(async () => {
    server = createServer((request, response) => {
      received.push(request.url ?? '')
      if (request.url === '/bomb') return response.writeHead(200, { 'content-encoding': 'gzip', 'content-type': 'text/plain' }).end(bomb)
      if (request.url === '/moved') return response.writeHead(302, { location: `http://127.0.0.1:${port}/inside` }).end()
      response.writeHead(200, { 'content-type': 'text/plain' }).end('ok')
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    port = (server.address() as AddressInfo).port
  })
  afterAll(() => new Promise((resolve) => server.close(resolve)))

  it('refuses a host that resolves to loopback or the metadata address, and nothing reaches the receiver', async () => {
    const before = received.length
    for (const address of ['127.0.0.1', '169.254.169.254']) {
      const fetch = pluginFetch({ resolve: async () => [address] })
      await expect(fetch(`http://plugin.test:${port}/`)).rejects.toBeInstanceOf(AddressRefusedError)
    }
    expect(received.length).toBe(before)
  })

  it('resolves a host once and connects to the address it checked, so a resolver that answers differently later is never asked', async () => {
    const answers = ['127.0.0.1', '10.0.0.7']
    let asked = 0
    const fetch = pluginFetch({ allowPrivateAddresses: true, resolve: async () => [answers[asked++]!] })
    const answer = await fetch(`http://rebind.test:${port}/first`)
    expect(await answer.text()).toBe('ok')
    expect(asked).toBe(1)
    expect(received.at(-1)).toBe('/first')
  })

  it('follows no redirect: a 302 to a private address comes back as it is, and the address gets no request', async () => {
    const fetch = pluginFetch({ allowPrivateAddresses: true })
    const answer = await fetch(`http://127.0.0.1:${port}/moved`)
    expect(answer.status).toBe(302)
    expect(received).not.toContain('/inside')
  })

  it('refuses a maxBytes that is no number of bytes before it sends anything', async () => {
    const fetch = pluginFetch({ allowPrivateAddresses: true })
    const before = received.length
    for (const maxBytes of [Number.NaN, -1, Number.POSITIVE_INFINITY]) await expect(fetch(`http://127.0.0.1:${port}/`, { maxBytes })).rejects.toBeInstanceOf(RangeError)
    expect(received.length).toBe(before)
  })

  it('counts the body as it came off the wire and never decodes it, so a gzip bomb costs at most its cap', async () => {
    const fetch = pluginFetch({ allowPrivateAddresses: true })
    const answer = await fetch(`http://127.0.0.1:${port}/bomb`)
    const bytes = new Uint8Array(await answer.arrayBuffer())
    expect(bytes.length).toBe(bomb.length)
    expect(bytes.subarray(0, 2)).toEqual(new Uint8Array([0x1f, 0x8b]))
    await expect(fetch(`http://127.0.0.1:${port}/bomb`, { maxBytes: 1024 })).rejects.toEqual(new ResponseTooLargeError(1024))
  })

  it('with stream, leaves the body unread and uncapped, behind the same address guard', async () => {
    const fetch = pluginFetch({ allowPrivateAddresses: true })
    const answer = await fetch(`http://127.0.0.1:${port}/bomb`, { stream: true, maxBytes: 1024 })
    expect(answer.bodyUsed).toBe(false)
    expect((await new Response(answer.body).arrayBuffer()).byteLength).toBe(bomb.length)
    await expect(pluginFetch({ resolve: async () => ['169.254.169.254'] })(`http://plugin.test:${port}/`, { stream: true })).rejects.toBeInstanceOf(AddressRefusedError)
  })
})
