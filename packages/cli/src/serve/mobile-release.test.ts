import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { nativeFingerprint } from '@protobase/server/mobile-release'
import { releaseOrigin, servedRelease } from './mobile-release'

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
    const release = await servedRelease({ site: site(), mobile, issuer: 'https://shop.example.com' })
    expect(release?.fingerprint).toBe(nativeFingerprint(native, mobile.plugins))
    expect(release?.origin).toBe('https://shop.example.com')
    expect(new TextDecoder().decode(release?.files.get('index.html')?.content)).toContain('content="https://shop.example.com"')
  })

  it('is none without a mobile section, a site naming its native packages or an origin an app calls', async () => {
    expect(await servedRelease({ site: site(), issuer: 'https://shop.example.com' })).toBeUndefined()
    expect(await servedRelease({ mobile, issuer: 'https://shop.example.com' })).toBeUndefined()
    expect(await servedRelease({ site: { publicDir, spa: 'index.html', api: ['/api'] }, mobile, issuer: 'https://shop.example.com' })).toBeUndefined()
    expect(await servedRelease({ site: site(), mobile, issuer: 'http://shop.example.com' })).toBeUndefined()
  })
})
