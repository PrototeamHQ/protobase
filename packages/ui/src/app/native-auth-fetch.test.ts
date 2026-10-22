import { describe, expect, it, vi } from 'vitest'
import { nativeAuthFetch, nativeBridgeOf, type NativeBridge } from './native-auth-fetch'

const api = 'https://shop.example.com'
const platforms = ['ios', 'android']

const fakeBridge = (platform: string, answer: unknown = { status: 200, headers: { 'content-type': 'application/json' }, data: { ok: true } }) => {
  const nativePromise = vi.fn<NativeBridge['nativePromise']>(async () => answer)
  return { bridge: { isNativePlatform: () => true, getPlatform: () => platform, nativePromise }, nativePromise }
}

describe('nativeAuthFetch', () => {
  it('signs in through ProtobaseAuth on Android, which names the origin and keeps redirects and Set-Cookie natively', async () => {
    const { bridge, nativePromise } = fakeBridge('android')
    const body = JSON.stringify({ email: 'ada@example.com', otp: '123456' })
    await nativeAuthFetch(bridge, api)(`${api}/api/auth/sign-in/email-otp`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-extra': 'yes', origin: 'https://evil.example' }, body })
    // The page's origin header is passed on for ProtobaseAuth to drop.
    expect(nativePromise).toHaveBeenCalledWith('ProtobaseAuth', 'request', {
      url: `${api}/api/auth/sign-in/email-otp`,
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-extra': 'yes', origin: 'https://evil.example' },
      data: body,
    })
  })

  it('signs in through native HTTP on iOS, naming the Capacitor origin and keeping redirects for the page to see', async () => {
    const { bridge, nativePromise } = fakeBridge('ios')
    const body = JSON.stringify({ email: 'ada@example.com', otp: '123456' })
    await nativeAuthFetch(bridge, api)(`${api}/api/auth/sign-in/email-otp`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-extra': 'yes', origin: 'https://evil.example' }, body })
    expect(nativePromise).toHaveBeenCalledWith('CapacitorHttp', 'request', {
      url: `${api}/api/auth/sign-in/email-otp`,
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-extra': 'yes', origin: 'capacitor://localhost' },
      data: body,
      responseType: 'text',
      disableRedirects: true,
    })
  })

  it.each(['ios', 'android'])('sends no body with a GET on %s', async (platform) => {
    const { bridge, nativePromise } = fakeBridge(platform)
    await nativeAuthFetch(bridge, api)(`${api}/api/auth/token`)
    expect(nativePromise.mock.calls[0]![2]).not.toHaveProperty('data')
  })

  it.each(platforms)('writes a JSON answer out again, a top-level string included, on %s', async (platform) => {
    const parsed = fakeBridge(platform, { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' }, data: { user: { id: 'u1' } } })
    expect(await (await nativeAuthFetch(parsed.bridge, api)(`${api}/api/auth/get-session`)).json()).toEqual({ user: { id: 'u1' } })
    const unquoted = fakeBridge(platform, { status: 200, headers: { 'content-type': 'application/json' }, data: 'plain' })
    expect(await (await nativeAuthFetch(unquoted.bridge, api)(`${api}/api/auth/x`)).json()).toBe('plain')
  })

  it.each(platforms)('keeps a text answer as it is on %s', async (platform) => {
    const { bridge } = fakeBridge(platform, { status: 200, headers: { 'content-type': 'text/plain' }, data: 'hello' })
    expect(await (await nativeAuthFetch(bridge, api)(`${api}/api/auth/ok`)).text()).toBe('hello')
  })

  it.each(platforms)('answers a 204 with no body on %s', async (platform) => {
    const { bridge } = fakeBridge(platform, { status: 204, headers: {}, data: '' })
    const response = await nativeAuthFetch(bridge, api)(`${api}/api/auth/sign-out`, { method: 'POST' })
    expect(response.status).toBe(204)
    expect(response.body).toBeNull()
  })

  it.each(platforms)('answers a refusal as it is, never as a success, on %s', async (platform) => {
    const { bridge } = fakeBridge(platform, { status: 403, headers: { 'content-type': 'application/json' }, data: { code: 'INVALID_ORIGIN' } })
    const response = await nativeAuthFetch(bridge, api)(`${api}/api/auth/sign-in/email-otp`, { method: 'POST', body: '{}' })
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ code: 'INVALID_ORIGIN' })
  })

  it.each(platforms)('leaves Set-Cookie to the native cookie jar on %s', async (platform) => {
    const { bridge } = fakeBridge(platform, { status: 200, headers: { 'content-type': 'application/json', 'Set-Cookie': 'session=secret' }, data: {} })
    const response = await nativeAuthFetch(bridge, api)(`${api}/api/auth/sign-in/email-otp`, { method: 'POST', body: '{}' })
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it.each(platforms)('rejects when native HTTP fails on %s', async (platform) => {
    const { bridge, nativePromise } = fakeBridge(platform)
    nativePromise.mockRejectedValueOnce(new Error('The network connection was lost.'))
    await expect(nativeAuthFetch(bridge, api)(`${api}/api/auth/get-session`)).rejects.toThrow('The network connection was lost.')
  })

  it.each([
    `${api}/api/v1/x`,
    `${api}/api/auth`,
    `${api}/api/auth/../v1/x`,
    `${api}/api/auth/%2e%2e/v1/x`,
    `${api}/api/auth/%2e%2e%2fv1/x`,
    `${api}/api/auth/%2E%2E%2Fv1/x`,
    `${api}/api/auth/%2e%2e%5cv1/x`,
    'https://shop.example.com.evil.com/api/auth/x',
    'https://user@evil.com/api/auth/x',
    'https://user:pass@shop.example.com/api/auth/x',
    'https://user@shop.example.com/api/auth/x',
    'http://shop.example.com/api/auth/x',
    'https://other.example.com/api/auth/x',
  ])('refuses %s without calling the bridge', async (url) => {
    for (const platform of platforms) {
      const { bridge, nativePromise } = fakeBridge(platform)
      // A Request with credentials in its URL cannot even be made; the wrapper refuses one all the same.
      await expect(nativeAuthFetch(bridge, api)(url)).rejects.toThrow()
      expect(nativePromise).not.toHaveBeenCalled()
    }
  })

  it.each([`${api}/api/v1`, `${api}/`])('refuses every address when the API origin is given as %s', async (given) => {
    for (const platform of platforms) {
      const { bridge, nativePromise } = fakeBridge(platform)
      await expect(nativeAuthFetch(bridge, given)(`${api}/api/auth/sign-in/email-otp`, { method: 'POST', body: '{}' })).rejects.toThrow()
      expect(nativePromise).not.toHaveBeenCalled()
    }
  })

  it('is only for iOS and Android', () => {
    expect(() => nativeAuthFetch(fakeBridge('web').bridge, api)).toThrow('for iOS and Android, not web')
  })
})

describe('nativeBridgeOf', () => {
  it('is the bridge on a native platform only', () => {
    const { bridge } = fakeBridge('ios')
    expect(nativeBridgeOf({ Capacitor: bridge })).toBe(bridge)
    expect(nativeBridgeOf({ Capacitor: { ...bridge, isNativePlatform: () => false } })).toBeUndefined()
    expect(nativeBridgeOf({})).toBeUndefined()
  })
})
