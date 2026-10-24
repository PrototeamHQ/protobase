import { describe, expect, it } from 'vitest'
import { deviceAppName } from './device-app-name'

const url = new URL('https://shop.example.com')
const manifest = (body: unknown, init: ResponseInit = {}) => async () => Response.json(body, { headers: { 'content-type': 'application/manifest+json' }, ...init })
const unreachable = async () => {
  throw new TypeError('fetch failed')
}

describe('deviceAppName', () => {
  it("is the name the server's manifest gives, over the project's own and the environment's", async () => {
    const asked: string[] = []
    const fetch = async (input: URL | RequestInfo) => {
      asked.push(String(input))
      return manifest({ name: 'mobile-lab' })()
    }
    const warnings: string[] = []
    const name = await deviceAppName({ url, auth: { appName: 'Shop' }, env: { PROTOBASE_APP_NAME: 'Store' }, fetch, onWarning: (message) => void warnings.push(message) })
    expect(name).toBe('mobile-lab')
    expect(asked).toEqual(['https://shop.example.com/api/manifest.webmanifest'])
    expect(warnings).toEqual([])
  })

  it("takes the project's own name with a warning when the server cannot be reached or names no app", async () => {
    for (const fetch of [unreachable, manifest({}), manifest({ name: 'x' }, { status: 404 }), async () => new Response('<html></html>', { headers: { 'content-type': 'text/html' } })]) {
      const warnings: string[] = []
      expect(await deviceAppName({ url, auth: undefined, env: { PROTOBASE_APP_NAME: 'Store' }, fetch, onWarning: (message) => void warnings.push(message) })).toBe('Store')
      expect(warnings).toEqual(['https://shop.example.com answered no app name at /api/manifest.webmanifest: the app is installed as "Store", the name this project gives itself'])
    }
  })

  it('stops a release whose server names no app', async () => {
    const input = { url, auth: { appName: 'Shop' }, env: {}, release: true, fetch: unreachable, onWarning: () => {} }
    await expect(deviceAppName(input)).rejects.toThrow("answered no app name at /api/manifest.webmanifest, the name the release is installed under: build it against the app's running server")
  })

  it('rethrows what is not the server being out of reach', async () => {
    const fetch = async () => {
      throw new RangeError('bad')
    }
    await expect(deviceAppName({ url, auth: undefined, env: {}, fetch, onWarning: () => {} })).rejects.toThrow(RangeError)
  })
})
