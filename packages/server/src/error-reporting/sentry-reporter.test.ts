import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { startErrorReporting } from './error-reporter'

type Received = { path: string; items: unknown[] }

// A stand-in for the tracker's envelope endpoint: each envelope as its path and its JSON lines.
const tracker = async () => {
  const received: Received[] = []
  const server = createServer((request, response) => {
    let body = ''
    request.on('data', (chunk) => (body += chunk))
    request.on('end', () => {
      received.push({ path: request.url ?? '', items: body.split('\n').filter(Boolean).map((line) => JSON.parse(line)) })
      response.end('{}')
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return { server, received, dsn: `http://public@127.0.0.1:${(server.address() as AddressInfo).port}/42` }
}

let server: Server | undefined
afterEach(() => server?.close())

describe('startErrorReporting', () => {
  it('sends a reported error with its request to the DSN project, without the secrets', async () => {
    const fake = await tracker()
    server = fake.server
    const reporter = await startErrorReporting({ dsn: fake.dsn, environment: 'staging' })
    const request = new Request('https://app.example.com/api/v1/bikes?token=t&page=2', { headers: { authorization: 'Bearer abc', cookie: 'better-auth.session_token=s', accept: 'application/json' } })
    reporter.report(new Error('boom'), request)
    expect(await reporter.flush(2000)).toBe(true)

    expect(fake.received).toHaveLength(1)
    expect(fake.received[0]!.path).toMatch(/^\/api\/42\/envelope\/\?/)
    const event = fake.received[0]!.items[2] as { environment: string; exception: { values: Array<{ value: string; stacktrace?: unknown }> }; request: { method: string; url: string; headers: Record<string, string>; cookies?: unknown } }
    expect(event.environment).toBe('staging')
    expect(event.exception.values[0]).toMatchObject({ value: 'boom', stacktrace: { frames: expect.any(Array) } })
    expect(event.request.method).toBe('GET')
    expect(event.request.headers.accept).toBe('application/json')
    expect(JSON.stringify(event)).not.toMatch(/Bearer abc|session_token=s|token=t\b/)
  })

  it('sends an error without a request too', async () => {
    const fake = await tracker()
    server = fake.server
    const reporter = await startErrorReporting({ dsn: fake.dsn })
    reporter.report(new Error('job failed'))
    expect(await reporter.flush(2000)).toBe(true)
    expect(fake.received[0]!.items[2]).toMatchObject({ exception: { values: [{ value: 'job failed' }] } })
  })
})
