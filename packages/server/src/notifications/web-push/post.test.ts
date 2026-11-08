import { describe, expect, it } from 'vitest'
import { pinnedRequest, type PinnedInit, type Resolve } from '../../webhooks/table/pinned-request'
import { postPush, type PushRequest } from './post'

const url = new URL('https://fcm.googleapis.com/fcm/send/device-path')
const answering = (status: number, headers: Record<string, string> = {}): PushRequest => async () => new Response(status === 204 || status === 304 ? null : 'body', { status, headers })
const rejecting = (error: unknown): PushRequest => async () => {
  throw error
}

// The pinned request as the sender makes it, with the push service's host resolving to `addresses`.
const resolvingTo = (addresses: string[]) => {
  const asked: string[] = []
  const resolve: Resolve = async (host) => (asked.push(host), addresses)
  const request: PushRequest = (target, init) => pinnedRequest(target.href, init, { resolve })
  return { request, asked }
}

describe('postPush', () => {
  it.each([
    [200, { result: 'ok' }],
    [201, { result: 'ok' }],
    [202, { result: 'ok' }],
    [404, { result: 'gone' }],
    [410, { result: 'gone' }],
    [429, { result: 'retry' }],
    [500, { result: 'retry' }],
    [503, { result: 'retry' }],
    [301, { result: 'retry' }],
    [302, { result: 'retry' }],
    [307, { result: 'retry' }],
    [308, { result: 'retry' }],
    [400, { result: 'retry' }],
    [401, { result: 'retry' }],
    [403, { result: 'retry' }],
    [413, { result: 'retry' }],
  ])('answers %i as %j', async (status, answer) => {
    expect(await postPush(url, {}, new Uint8Array(1), { request: answering(status) })).toEqual(answer)
  })

  it('passes on Retry-After in seconds, and only that', async () => {
    expect(await postPush(url, {}, new Uint8Array(1), { request: answering(429, { 'Retry-After': '120' }) })).toEqual({ result: 'retry', retryAfterSeconds: 120 })
    expect(await postPush(url, {}, new Uint8Array(1), { request: answering(503, { 'Retry-After': 'Wed, 21 Oct 2026 07:28:00 GMT' }) })).toEqual({ result: 'retry' })
  })

  it('sends one request to the endpoint and never follows a redirect', async () => {
    const requests: { url: string; init: PinnedInit }[] = []
    const request: PushRequest = async (target, init) => {
      requests.push({ url: target.href, init })
      return new Response(null, { status: 302, headers: { Location: 'http://169.254.169.254/' } })
    }
    expect(await postPush(url, { TTL: '60' }, new Uint8Array(1), { request })).toEqual({ result: 'retry' })
    expect(requests).toHaveLength(1)
    expect(requests[0]!.url).toBe(url.href)
    expect(requests[0]!.init).toMatchObject({ method: 'POST' })
    expect(new Headers(requests[0]!.init.headers).get('ttl')).toBe('60')
  })

  it.each([
    ['IPv4 loopback', ['127.0.0.1']],
    ['a private IPv4 address', ['10.0.0.1']],
    ['the cloud metadata address', ['169.254.169.254']],
    ['0.0.0.0', ['0.0.0.0']],
    ['IPv6 loopback', ['::1']],
    ['an IPv6 unique local address', ['fc00::1']],
    ['an IPv6 link-local address', ['fe80::1']],
    ['an IPv4-mapped loopback', ['::ffff:127.0.0.1']],
    ['a public and a private address', ['142.250.180.10', '10.0.0.1']],
    ['no address', []],
  ])('answers an endpoint whose host resolves to %s refused, resolving once and sending nothing', async (_name, addresses) => {
    const { request, asked } = resolvingTo(addresses)
    expect(await postPush(url, {}, new Uint8Array(1), { request })).toEqual({ result: 'refused' })
    expect(asked).toEqual(['fcm.googleapis.com'])
  })

  it('checks the address by default, refusing a private one without connecting', async () => {
    // Port 9 (discard) on loopback: a connection would fail as a retry, so `refused` shows none was tried.
    expect(await postPush(new URL('https://127.0.0.1:9/fcm/send/device-path'), {}, new Uint8Array(1))).toEqual({ result: 'refused' })
    expect(await postPush(new URL('https://[::1]:9/fcm/send/device-path'), {}, new Uint8Array(1))).toEqual({ result: 'refused' })
  })

  it.each([
    ['a host that does not resolve now', Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' })],
    ['a refused connection', Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })],
    ['a reset connection', Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' })],
    ['a certificate that does not verify', Object.assign(new Error('self-signed certificate'), { code: 'DEPTH_ZERO_SELF_SIGNED_CERT' })],
    ['a timeout', new DOMException('timed out', 'TimeoutError')],
    ['an abort', Object.assign(new Error('The operation was aborted'), { name: 'AbortError', code: 'ABORT_ERR' })],
  ])('answers %s as retry', async (_name, error) => {
    expect(await postPush(url, {}, new Uint8Array(1), { request: rejecting(error) })).toEqual({ result: 'retry' })
  })

  it('passes on none of an unexpected error, which may name the URL', async () => {
    const error = Object.assign(new Error(`failed: ${url.href}`), { path: url.href })
    const thrown = await postPush(url, {}, new Uint8Array(1), { request: rejecting(error) }).catch((caught: unknown) => caught)
    expect(thrown).toBeInstanceOf(Error)
    expect(JSON.stringify({ ...(thrown as object), message: (thrown as Error).message, cause: (thrown as Error).cause })).not.toContain('device-path')
  })

  it('throws, not retries, for a request it cannot build', async () => {
    await expect(postPush(url, { 'X-Bad': 'a\r\nb' }, new Uint8Array(1), { request: answering(201) })).rejects.toBeInstanceOf(TypeError)
  })
})
