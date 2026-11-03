import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, describe, expect, it } from 'vitest'
import { attemptDelivery, type AttemptContext } from './attempt'
import { newWebhookSecret } from './standard-webhooks'
import { subscription, type SubscriptionEvent } from './subscription'
import type { Resolve } from './table/pinned-request'

const servers: Server[] = []
afterAll(() => {
  for (const server of servers) server.close()
})

// A local receiver answering `status`, counting what reaches it.
const receiver = async (status: number, headers: Record<string, string> = {}) => {
  let reached = 0
  const server = createServer((request, response) => {
    reached++
    request.resume().on('end', () => response.writeHead(status, headers).end('moved'))
  })
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return { port: (server.address() as AddressInfo).port, reached: () => reached }
}

const event: SubscriptionEvent = { id: 'evt_1', type: 'orders.created', timestamp: '2026-11-03T12:00:00Z', data: { resource: 'orders', key: '1', after: { note: 'private payload' } } as never }
const secret = newWebhookSecret()
const hook = (url: string) => subscription('hook', { events: ['orders.created'], url, secret, headers: { authorization: 'Bearer secret-token' } })
const context = (resolve: Resolve, allowPrivateAddresses = false): AttemptContext => ({
  db: {} as never,
  functions: {},
  records: () => ({}) as never,
  channels: {} as never,
  attempt: 1,
  signal: new AbortController().signal,
  allowPrivateAddresses,
  resolve,
})

describe('attemptDelivery to a URL', () => {
  it('refuses, as a final failed try, a host that now resolves to a private address though its URL passed when saved', async () => {
    const own = await receiver(200)
    const result = await attemptDelivery(hook(`http://hook.test:${own.port}/in`), event, context(async () => ['127.0.0.1']))
    expect(result).toEqual({ ok: false, error: 'hook.test is a private address (127.0.0.1); requests reach public addresses only', final: true })
    expect(JSON.stringify(result)).not.toMatch(/secret-token|private payload|whsec_|v1,/)
    expect(own.reached()).toBe(0)
  })

  it('fails on a redirect and follows it nowhere', async () => {
    const moved = await receiver(302, { location: 'http://169.254.169.254/latest' })
    const result = await attemptDelivery(hook(`http://hook.test:${moved.port}/in`), event, context(async () => ['127.0.0.1'], true))
    expect(result).toEqual({ ok: false, status: 302, error: '302: moved', final: false })
    expect(moved.reached()).toBe(1)
  })

  it('delivers to a receiver that answers 2xx', async () => {
    const ok = await receiver(204)
    expect(await attemptDelivery(hook(`http://hook.test:${ok.port}/in`), event, context(async () => ['127.0.0.1'], true))).toEqual({ ok: true, status: 204 })
  })
})
