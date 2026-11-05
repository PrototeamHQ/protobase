import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { secretRedactor, StepError } from '@protobase/workflows'
import { localFiles } from '../files/local-files'
import type { FilesRuntime } from '../files/runtime'
import { tempDir } from '../files/testing/temp-dir'
import { fetchMaxBytes as httpBodyLimit } from '@protobase/workflows/plugin'
import { builtInStep, type BuiltInStepOptions } from './testing/built-in-step'

const httpStep = (options: BuiltInStepOptions = {}) => builtInStep('app:http', options)

const secret = 'tok-9c31d7a0b2e4'
const redactor = secretRedactor([secret])
const logs: string[] = []
const context = (runId = 'run-1') => ({ runId, signal: new AbortController().signal, idempotencyKey: `${runId}//0`, log: (message: string) => void logs.push(message), redact: redactor.text })
const seen: { method?: string; url?: string; body: string; type?: string }[] = []

describe('the app:http step, run through the plugin interface', () => {
  let server: Server
  let base: string
  let folder: Awaited<ReturnType<typeof tempDir>>
  let files: FilesRuntime

  beforeAll(async () => {
    folder = await tempDir()
    files = { providers: { private: localFiles({ dir: folder.dir }) } } as unknown as FilesRuntime
    server = createServer((request, response) => {
      const chunks: Buffer[] = []
      request.on('data', (chunk: Buffer) => chunks.push(chunk))
      request.on('end', () => {
        const body = Buffer.concat(chunks).toString('latin1')
        seen.push({ method: request.method, url: request.url, body, ...(request.headers['content-type'] && { type: request.headers['content-type'] }) })
        if (request.url === '/big') {
          // Chunked, with no Content-Length: only counting the bytes read stops it.
          response.writeHead(200, { 'content-type': 'text/plain' })
          const chunk = Buffer.alloc(1024 * 1024, 'x')
          for (let index = 0; index <= httpBodyLimit / chunk.length; index++) response.write(chunk)
          return response.end()
        }
        if (request.url === '/gone') return response.writeHead(410).end()
        if (request.url?.startsWith('/echo')) return response.writeHead(500, { 'content-type': 'text/plain' }).end(`${'e'.repeat(190)}${request.headers.authorization}`)
        if (request.url === '/moved') return response.writeHead(302, { location: 'http://10.0.0.7/admin' }).end()
        if (request.url === '/report.pdf') return response.writeHead(200, { 'content-type': 'application/pdf' }).end('%PDF-1.4 report')
        if (request.url === '/files/a%zz') return response.writeHead(200, { 'content-type': 'application/octet-stream' }).end('bytes')
        if (request.url === '/text') return response.writeHead(200, { 'content-type': 'text/plain' }).end('plain words')
        response.writeHead(200, { 'content-type': 'application/json', 'set-cookie': 'session=1' }).end(JSON.stringify({ ok: true }))
      })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve))
    await folder.remove()
  })

  const local = () => httpStep({ allowPrivateAddresses: true, files: () => files })
  const failure = (promise: Promise<unknown>) => promise.then(() => undefined, (error: unknown) => (error instanceof StepError ? [error.error, error.reason] : error))

  it('sends JSON with the query and returns the status, headers without cookies and the parsed body', async () => {
    const result = await local()({ url: `${base}/items`, method: 'post', query: { page: '2' }, body: { name: 'a' } }, context())
    expect(result).toMatchObject({ status: 200, body: { ok: true }, headers: { 'content-type': 'application/json' } })
    expect((result as { headers: object }).headers).not.toHaveProperty('set-cookie')
    expect(seen.at(-1)).toEqual({ method: 'POST', url: '/items?page=2', body: '{"name":"a"}', type: 'application/json' })
    expect(logs.at(-1)).toMatch(new RegExp(`^POST ${base}/items: 200 in \\d+ ms$`))
  })

  it('reads the answer as text or as a file of the run, and sends such a file as its bytes with its type', async () => {
    expect(await local()({ url: `${base}/text`, response: 'text' }, context())).toMatchObject({ body: 'plain words' })
    expect(await failure(local()({ url: `${base}/text` }, context()))).toEqual(['Http.InvalidBody', `127.0.0.1:${(server.address() as AddressInfo).port} answered with a body that is not JSON; read it with "response": "text"`])
    const { body: pdf } = (await local()({ url: `${base}/report.pdf`, response: 'file' }, context())) as { body: { uri: string; name: string; type: string; size: number } }
    expect(pdf).toEqual({ uri: expect.stringMatching(/^private:workflows\/run-1\/[0-9a-f-]{36}\?name=report.pdf&size=15$/), name: 'report.pdf', type: 'application/pdf', size: 15 })
    await local()({ url: `${base}/upload`, method: 'PUT', body: pdf }, context())
    expect(seen.at(-1)).toEqual({ method: 'PUT', url: '/upload', body: '%PDF-1.4 report', type: 'application/pdf' })
    expect(await failure(local()({ url: `${base}/upload`, method: 'PUT', body: pdf }, context('run-2')))).toEqual(['States.TaskFailed', 'body is not a file this run stored; a step takes only the files of its own run'])
    expect(await failure(httpStep({ allowPrivateAddresses: true })({ url: `${base}/report.pdf`, response: 'file' }, context()))).toEqual(['States.TaskFailed', 'The app keeps no files: workflows store theirs with the "private" file provider'])
  })

  it('fails on a status outside 2xx, with the start of the body blanked of secrets before it is cut, and on arguments that make no request', async () => {
    expect(await failure(local()({ url: `${base}/gone` }, context()))).toEqual(['Http.Status', `127.0.0.1:${(server.address() as AddressInfo).port} answered 410`])
    const [name, cause] = (await failure(local()({ url: `${base}/echo?token=${secret}`, headers: { Authorization: `Bearer ${secret}` } }, context()))) as string[]
    expect(name).toBe('Http.Status')
    expect(cause).toBe(`127.0.0.1:${(server.address() as AddressInfo).port} answered 500: ${'e'.repeat(190)}Bearer [re`)
    expect(cause).not.toContain(secret.slice(0, 3))
    expect(await failure(local()({ url: 'ftp:/nowhere' }, context()))).toEqual(['Http.AddressRefused', 'ftp: URLs are not requested; use http or https'])
    expect(await failure(local()({ url: base, method: 'HEAD' }, context()))).toEqual(['Http.InvalidArguments', 'method must be one of GET, POST, PUT, PATCH, DELETE'])
    expect(await failure(local()({ url: base, response: 'xml' }, context()))).toEqual(['Http.InvalidArguments', 'response must be equal to one of the allowed values'])
  })

  it('fails when no answer comes as Http.Network', async () => {
    const closed = createServer()
    await new Promise<void>((resolve) => closed.listen(0, '127.0.0.1', resolve))
    const port = (closed.address() as AddressInfo).port
    await new Promise((resolve) => closed.close(resolve))
    const [name, cause] = (await failure(local()({ url: `http://127.0.0.1:${port}/` }, context()))) as string[]
    expect(name).toBe('Http.Network')
    expect(cause).toMatch(new RegExp(`^No answer from 127.0.0.1:${port}: .*ECONNREFUSED`))
  })

  it('fails a chunked answer larger than its limit, rather than cutting it short', async () => {
    expect(await failure(local()({ url: `${base}/big` }, context()))).toEqual(['Http.ResponseTooLarge', "The answer's body is larger than 10 MiB, the most the http step reads"])
  })

  it('follows no redirect, so one to a private address makes no connection there', async () => {
    const resolved: string[] = []
    const step = httpStep({ allowPrivateAddresses: true, resolve: async (host) => (resolved.push(host), [host]) })
    expect(await failure(step({ url: `${base}/moved` }, context()))).toEqual(['Http.Status', `127.0.0.1:${(server.address() as AddressInfo).port} answered 302`])
    expect(resolved).toEqual([])
  })

  it('refuses a host that resolves to a private address, and private addresses in any spelling, before it connects', async () => {
    const before = seen.length
    const guarded = httpStep({ resolve: async () => ['93.184.215.14', '10.0.0.7'] })
    expect(await failure(guarded({ url: `http://inside.test:${(server.address() as AddressInfo).port}/` }, context()))).toEqual(['Http.AddressRefused', 'inside.test is a private address (10.0.0.7); requests reach public addresses only'])
    const step = httpStep()
    for (const [url, address] of [[`${base}/items`, '127.0.0.1'], ['http://169.254.169.254/latest/meta-data', '169.254.169.254'], ['http://2130706433/', '127.0.0.1'], ['http://[::ffff:127.0.0.1]/', '::ffff:7f00:1'], ['http://[fe80::1]/', 'fe80::1']]) {
      expect(await failure(step({ url }, context()))).toEqual(['Http.AddressRefused', `${address} is a private address (${address}); requests reach public addresses only`])
    }
    expect(seen.length).toBe(before)
  })

  it('sends an object with only a uri as JSON, and logs the URL as given, without its query', async () => {
    await local()({ url: `${base}/links?key=${secret}`, method: 'POST', body: { uri: 'https://cdn.example/file' } }, context())
    expect(seen.at(-1)).toMatchObject({ body: '{"uri":"https://cdn.example/file"}', type: 'application/json' })
    await local()({ url: `${base}/a b/${secret}` }, context())
    expect(redactor.text(logs.at(-1)!)).toMatch(new RegExp(`^GET ${base}/a b/\\[redacted\\]: 200 in \\d+ ms$`))
  })

  it('keeps a file name whose escapes do not decode as it is', async () => {
    const { body } = (await local()({ url: `${base}/files/a%zz`, response: 'file' }, context())) as { body: { name: string; size: number } }
    expect(body).toMatchObject({ name: 'a%zz', size: 5 })
  })

  it('logs a URL without the user name and password it carries', async () => {
    await local()({ url: `http://user:pw@127.0.0.1:${(server.address() as AddressInfo).port}/x` }, context())
    expect(logs.at(-1)).toMatch(/^GET http:\/\/127\.0\.0\.1:\d+\/x: 200 in \d+ ms$/)
    expect(logs.at(-1)).not.toContain('user')
    expect(logs.at(-1)).not.toContain('pw')
  })

  it('keeps no file of a run in a private provider that is public', async () => {
    const shared = { providers: { private: localFiles({ dir: folder.dir, public: true }) } } as unknown as FilesRuntime
    expect(await failure(httpStep({ allowPrivateAddresses: true, files: () => shared })({ url: `${base}/report.pdf`, response: 'file' }, context()))).toEqual(['States.TaskFailed', 'The "private" file provider is public, so workflows keep no files in it: anyone could read them'])
  })
})
