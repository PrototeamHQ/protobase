import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { StepError } from '@protobase/workflows'
import { httpBodyLimit, httpStep } from './http-step'

const context = () => ({ signal: new AbortController().signal, idempotencyKey: 'run/0', log: (message: string) => void logs.push(message) })
const logs: string[] = []
const seen: { method?: string; url?: string; body: string; type?: string }[] = []

describe('the http step', () => {
  let server: Server
  let base: string

  beforeAll(async () => {
    server = createServer((request, response) => {
      let body = ''
      request.on('data', (chunk) => (body += chunk))
      request.on('end', () => {
        seen.push({ method: request.method, url: request.url, body, ...(request.headers['content-type'] && { type: request.headers['content-type'] }) })
        if (request.url === '/big') {
          response.writeHead(200, { 'content-type': 'text/plain' })
          const chunk = Buffer.alloc(1024 * 1024, 'x')
          for (let index = 0; index <= httpBodyLimit / chunk.length; index++) response.write(chunk)
          return response.end()
        }
        if (request.url === '/gone') return response.writeHead(410).end()
        response.writeHead(200, { 'content-type': 'application/json', 'set-cookie': 'session=1' }).end(JSON.stringify({ ok: true }))
      })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(() => new Promise((resolve) => server.close(resolve)))

  const local = httpStep({ allowPrivateAddresses: true })
  const failure = (promise: Promise<unknown>) => promise.then(() => undefined, (error: unknown) => (error instanceof StepError ? [error.error, error.reason] : error))

  it('sends JSON with the query and returns the status, headers without cookies and the parsed body', async () => {
    const result = await local({ url: `${base}/items`, method: 'post', query: { page: '2' }, body: { name: 'a' } }, context())
    expect(result).toMatchObject({ status: 200, body: { ok: true }, headers: { 'content-type': 'application/json' } })
    expect((result as { headers: object }).headers).not.toHaveProperty('set-cookie')
    expect(seen.at(-1)).toEqual({ method: 'POST', url: '/items?page=2', body: '{"name":"a"}', type: 'application/json' })
    expect(logs.at(-1)).toMatch(new RegExp(`^POST ${base}/items: 200 in \\d+ ms$`))
  })

  it('fails on a status from 300 up, and on arguments that make no request', async () => {
    expect(await failure(local({ url: `${base}/gone` }, context()))).toEqual(['Http.StatusError', `127.0.0.1:${(server.address() as AddressInfo).port} answered 410`])
    expect(await failure(local({ url: 'ftp:/nowhere' }, context()))).toEqual(['Http.AddressRefused', 'ftp: URLs are not requested; use http or https'])
    expect(await failure(local({ url: base, method: 'TRACE' }, context()))).toEqual(['Http.InvalidArguments', 'method must be one of GET, HEAD, POST, PUT, PATCH, DELETE'])
  })

  it('fails an answer larger than its limit, rather than cutting it short', async () => {
    expect(await failure(local({ url: `${base}/big` }, context()))).toEqual(['Http.ResponseTooLarge', "The answer's body is larger than 10 MiB, the most the http step reads"])
  })

  it('refuses a host that resolves to a private address, before it connects', async () => {
    const before = seen.length
    const guarded = httpStep({ resolve: async () => ['93.184.215.14', '10.0.0.7'] })
    expect(await failure(guarded({ url: `http://inside.test:${(server.address() as AddressInfo).port}/` }, context()))).toEqual(['Http.AddressRefused', 'inside.test is a private address (10.0.0.7); requests reach public addresses only'])
    expect(await failure(httpStep()({ url: `${base}/items` }, context()))).toEqual(['Http.AddressRefused', '127.0.0.1 is a private address (127.0.0.1); requests reach public addresses only'])
    expect(seen.length).toBe(before)
  })
})
