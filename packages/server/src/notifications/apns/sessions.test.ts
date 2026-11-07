import { afterEach, describe, expect, it } from 'vitest'
import { apnsService, selfSignedService } from '../testing/apns-service'
import { postApns } from './post'
import { apnsSessions } from './sessions'

const closers: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const close of closers.splice(0)) await close()
})

describe('apnsSessions', () => {
  it('reuses one session per origin', async () => {
    const service = await apnsService()
    closers.push(service.close)
    const session = apnsSessions(service.connect)
    expect(session('https://api.push.apple.com') === session('https://api.push.apple.com')).toBe(true)
    expect(session('https://api.sandbox.push.apple.com') === session('https://api.push.apple.com')).toBe(false)
    expect(service.origins).toEqual(['https://api.push.apple.com', 'https://api.sandbox.push.apple.com'])
  })

  it('opens a new session after the server sends GOAWAY', async () => {
    const service = await apnsService()
    closers.push(service.close)
    const session = apnsSessions(service.connect)
    const origin = 'https://api.push.apple.com'
    expect(await postApns(session(origin), '/3/device/aa', {}, '{}')).toMatchObject({ status: 200 })
    service.goaway()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(await postApns(session(origin), '/3/device/aa', {}, '{}')).toMatchObject({ status: 200 })
    expect(service.sessions()).toBe(2)
  })

  it('opens a new session after the server drops one', async () => {
    const service = await apnsService((request) => (request.session === 1 ? 'destroy' : { status: 200 }))
    closers.push(service.close)
    const session = apnsSessions(service.connect)
    const origin = 'https://api.push.apple.com'
    expect(await postApns(session(origin), '/3/device/aa', {}, '{}')).toBeUndefined()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(await postApns(session(origin), '/3/device/aa', {}, '{}')).toMatchObject({ status: 200 })
  })

  it('verifies the certificate by default: a server no authority signed gets no request', async () => {
    const service = await selfSignedService()
    closers.push(service.close)
    const session = apnsSessions()
    expect(await postApns(session(service.origin), '/3/device/aa', { authorization: 'bearer secret' }, '{}')).toBeUndefined()
    expect(service.requests()).toBe(0)
  })
})

describe('postApns', () => {
  it('answers the status, reason and retry-after', async () => {
    const service = await apnsService(() => ({ status: 429, reason: 'TooManyRequests', headers: { 'retry-after': '30' } }))
    closers.push(service.close)
    expect(await postApns(apnsSessions(service.connect)('https://api.push.apple.com'), '/3/device/aa', {}, '{}')).toEqual({ status: 429, reason: 'TooManyRequests', retryAfter: '30' })
  })

  it('answers no answer when the server takes longer than the timeout', async () => {
    const service = await apnsService(() => ({ status: 200, delayMs: 500 }))
    closers.push(service.close)
    expect(await postApns(apnsSessions(service.connect)('https://api.push.apple.com'), '/3/device/aa', {}, '{}', 50)).toBeUndefined()
  })
})
