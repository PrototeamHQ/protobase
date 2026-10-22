import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { mobileReleaseBasePath, mobileReleasePath, mobileReleaseQuery, releaseManifestFile } from '@protobase/schema/internal'
import { composeRelease } from './release'
import { mobileReleaseApp } from './release-app'

const text = (value: string) => new TextEncoder().encode(value)
const release = { ...composeRelease([{ href: 'index.html', content: text('<!doctype html>') }]), fingerprint: 'f1', origin: 'https://shop.example.com' }
const app = mobileReleaseApp({ release, serverVersion: '0.14.2' })
const ask = (fingerprint: string, shellVersion: string, server = app) => server.request(`${mobileReleasePath}?${mobileReleaseQuery({ fingerprint, shellVersion })}`)
const fileOf = (bundleId: string, href: string) => app.request(`${mobileReleaseBasePath(bundleId)}?href=${encodeURIComponent(href)}`)

describe('mobileReleaseApp', () => {
  it('offers the release to a binary of its fingerprint, required once the shell no longer works with the server', async () => {
    const url = `https://shop.example.com/api/mobile/releases/${release.bundleId}`
    const same = await ask('f1', '0.14.0')
    expect(same.headers.get('cache-control')).toBe('no-store')
    expect(await same.json()).toEqual({ bundleId: release.bundleId, url, required: false })
    expect(await (await ask('f1', '0.13.5')).json()).toEqual({ bundleId: release.bundleId, url, required: true })
  })

  it('offers no release to another binary, or without one', async () => {
    expect(await (await ask('f2', '0.13.5')).json()).toEqual({ bundleId: null, url: null, required: true })
    expect(await (await ask('f1', '0.14.2', mobileReleaseApp({ serverVersion: '0.14.2' }))).json()).toEqual({ bundleId: null, url: null, required: false })
  })

  it('refuses a question without a fingerprint or an x.y.z shell version', async () => {
    expect((await app.request(`${mobileReleasePath}?shell_version=0.14.2`)).status).toBe(400)
    expect((await ask('f1', 'latest')).status).toBe(400)
  })

  it('serves the manifest and each file with its checksum, and nothing else', async () => {
    for (const href of [releaseManifestFile, 'index.html']) {
      const response = await fileOf(release.bundleId, href)
      const body = new Uint8Array(await response.arrayBuffer())
      expect(response.status).toBe(200)
      expect(response.headers.get('x-checksum')).toBe(createHash('sha256').update(body).digest('hex'))
      expect(response.headers.get('x-signature')).toBeNull()
    }
    expect((await fileOf(release.bundleId, 'index.html')).headers.get('content-type')).toContain('text/html')
    expect((await fileOf(release.bundleId, '../secret')).status).toBe(404)
    expect((await fileOf('0000000000000000', 'index.html')).status).toBe(404)
  })
})
