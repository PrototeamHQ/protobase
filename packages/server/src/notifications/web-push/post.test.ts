import { describe, expect, it } from 'vitest'
import { postPush } from './post'

const url = new URL('https://fcm.googleapis.com/fcm/send/device-path')
const answering = (status: number, headers: Record<string, string> = {}) => async () => new Response(status === 204 || status === 304 ? null : 'body', { status, headers })
const rejecting = (error: unknown) => async () => {
  throw error
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
    expect(await postPush(url, {}, new Uint8Array(1), { fetch: answering(status) })).toEqual(answer)
  })

  it('passes on Retry-After in seconds, and only that', async () => {
    expect(await postPush(url, {}, new Uint8Array(1), { fetch: answering(429, { 'Retry-After': '120' }) })).toEqual({ result: 'retry', retryAfterSeconds: 120 })
    expect(await postPush(url, {}, new Uint8Array(1), { fetch: answering(503, { 'Retry-After': 'Wed, 21 Oct 2026 07:28:00 GMT' }) })).toEqual({ result: 'retry' })
  })

  it('never follows a redirect', async () => {
    const requests: Request[] = []
    const fetch = async (request: Request) => {
      requests.push(request)
      return new Response(null, { status: 302, headers: { Location: 'http://169.254.169.254/' } })
    }
    expect(await postPush(url, {}, new Uint8Array(1), { fetch: fetch as typeof globalThis.fetch })).toEqual({ result: 'retry' })
    expect(requests).toHaveLength(1)
    expect(requests[0]!.redirect).toBe('manual')
    expect(requests[0]!.url).toBe(url.href)
  })

  it.each([
    ['a network error', new TypeError('fetch failed')],
    ['a timeout', new DOMException('timed out', 'TimeoutError')],
    ['an abort', new DOMException('aborted', 'AbortError')],
  ])('answers %s as retry', async (_name, error) => {
    expect(await postPush(url, {}, new Uint8Array(1), { fetch: rejecting(error) })).toEqual({ result: 'retry' })
  })

  it('passes on none of an unexpected error, which may name the URL', async () => {
    const error = Object.assign(new Error(`failed: ${url.href}`), { path: url.href })
    const thrown = await postPush(url, {}, new Uint8Array(1), { fetch: rejecting(error) }).catch((caught: unknown) => caught)
    expect(thrown).toBeInstanceOf(Error)
    expect(JSON.stringify({ ...(thrown as object), message: (thrown as Error).message, cause: (thrown as Error).cause })).not.toContain('device-path')
  })

  it('throws, not retries, for a request it cannot build', async () => {
    await expect(postPush(url, { 'X-Bad': 'a\r\nb' }, new Uint8Array(1), { fetch: answering(201) })).rejects.toBeInstanceOf(TypeError)
  })
})
