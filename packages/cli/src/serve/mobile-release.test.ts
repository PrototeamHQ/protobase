import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { generateKeyPairSync } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { releaseStatementFile } from '@protobase/schema/internal'
import { nativeFingerprint } from '@protobase/server/mobile-release'
import { releaseOrder, releaseOrigin, servedRelease } from './mobile-release'

const serverVersion = '0.14.2'

describe('releaseOrigin', () => {
  it("is the issuer's https origin, or plain http to this machine only", () => {
    expect(releaseOrigin('https://shop.example.com/')).toBe('https://shop.example.com')
    expect(releaseOrigin('http://localhost:3000')).toBe('http://localhost:3000')
    expect(releaseOrigin('http://192.168.1.5:3000')).toBeUndefined()
    expect(releaseOrigin('not a url')).toBeUndefined()
    expect(releaseOrigin(undefined)).toBeUndefined()
  })
})

describe('servedRelease', () => {
  let publicDir: string
  beforeAll(async () => {
    publicDir = await mkdtemp(path.join(tmpdir(), 'protobase-release-'))
    await writeFile(path.join(publicDir, 'index.html'), '<head></head>')
  })
  afterAll(() => rm(publicDir, { recursive: true, force: true }))

  const native = { '@capacitor/core': '8.5.3' }
  const site = () => ({ publicDir, spa: 'index.html', api: ['/api'], native })
  const mobile = { appId: 'com.example.shop', plugins: { '@capacitor/camera': '^8.0.0' } }

  it("runs on binaries of the site's native packages and the project's plugins, its page naming the API origin", async () => {
    const release = await servedRelease({ site: site(), mobile, issuer: 'https://shop.example.com', serverVersion })
    expect(release?.fingerprint).toBe(nativeFingerprint(native, mobile.plugins))
    expect(release?.origin).toBe('https://shop.example.com')
    expect(new TextDecoder().decode(release?.files.get('index.html')?.content)).toContain('content="https://shop.example.com"')
  })

  it('is none without a mobile section, a site naming its native packages or an origin an app calls', async () => {
    expect(await servedRelease({ site: site(), issuer: 'https://shop.example.com', serverVersion })).toBeUndefined()
    expect(await servedRelease({ mobile, issuer: 'https://shop.example.com', serverVersion })).toBeUndefined()
    expect(await servedRelease({ site: { publicDir, spa: 'index.html', api: ['/api'] }, mobile, issuer: 'https://shop.example.com', serverVersion })).toBeUndefined()
    expect(await servedRelease({ site: site(), mobile, issuer: 'http://shop.example.com', serverVersion })).toBeUndefined()
  })

  const statement = (release?: { files: Map<string, { content: Uint8Array }> }) => {
    const { payload } = JSON.parse(new TextDecoder().decode(release?.files.get(releaseStatementFile)?.content)) as { payload: string }
    return JSON.parse(Buffer.from(payload, 'hex').toString()) as Record<string, unknown>
  }

  it('signed, states its order, the app id, the fingerprint and the server version', async () => {
    const { privateKey: signingKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const release = await servedRelease({ site: { ...site(), builtAt: 5 }, mobile, issuer: 'https://shop.example.com', signingKey, serverVersion })
    expect(statement(release)).toMatchObject({ order: [5, 0], appId: mobile.appId, fingerprint: nativeFingerprint(native, mobile.plugins), shellVersion: serverVersion })
  })

  it('signed, is none for a bundle that names no build time', async () => {
    const { privateKey: signingKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    expect(await servedRelease({ site: site(), mobile, issuer: 'https://shop.example.com', signingKey, serverVersion })).toBeUndefined()
  })
})

describe('releaseOrder', () => {
  const site = { publicDir: '/app', spa: 'index.html', api: ['/api'] }

  it("is the bundle's build time, then the served shell's own, 0 with the bundle's copy", () => {
    expect(releaseOrder({ ...site, builtAt: 5 })).toEqual([5, 0])
    expect(releaseOrder({ ...site, builtAt: 5, shell: { dir: '/shell', paths: [], builtAt: 7 } })).toEqual([5, 7])
  })

  it('is none when the bundle or the served shell names no build time', () => {
    expect(releaseOrder(site)).toBeUndefined()
    expect(releaseOrder({ ...site, builtAt: 5, shell: { dir: '/shell', paths: [] } })).toBeUndefined()
  })
})
