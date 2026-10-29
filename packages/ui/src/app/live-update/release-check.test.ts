import { describe, expect, it, vi } from 'vitest'
import { checkRelease } from './release-check'

const input = { apiOrigin: 'https://shop.example.com', fingerprint: '0123456789abcdef', shellVersion: '0.14.2' }
const answer = { bundleId: 'abc', url: 'https://shop.example.com/api/mobile/releases/abc', required: false }

describe('checkRelease', () => {
  it('asks the release route for this binary and shell, without credentials, and gives the answer', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(answer))
    expect(await checkRelease(fetch, input)).toEqual(answer)
    const [url, init] = fetch.mock.calls[0]!
    expect(url).toBe('https://shop.example.com/api/mobile/release?fingerprint=0123456789abcdef&shell_version=0.14.2')
    expect(init).toMatchObject({ credentials: 'omit', cache: 'no-store' })
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })

  it('is none for a 503 while the server starts, a bare 500 and a body that is not the answer', async () => {
    const answers = [
      new Response('', { status: 503, headers: { 'retry-after': '30' } }),
      new Response('', { status: 500 }),
      Response.json({ bundleId: '../x', url: null, required: false }),
      new Response('<html>', { status: 200, headers: { 'content-type': 'application/json' } }),
    ]
    for (const response of answers) expect(await checkRelease(async () => response, input)).toBeUndefined()
  })

  it('is none without a network, or when the server does not answer in time', async () => {
    expect(await checkRelease(async () => Promise.reject(new TypeError('Failed to fetch')), input)).toBeUndefined()
    expect(await checkRelease(async () => Promise.reject(new DOMException('timed out', 'TimeoutError')), input)).toBeUndefined()
  })

  it('throws what is no missing answer', async () => {
    await expect(checkRelease(async () => Promise.reject(new RangeError('bug')), input)).rejects.toThrow('bug')
  })
})
