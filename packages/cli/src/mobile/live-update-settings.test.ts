import { createPublicKey, generateKeyPairSync } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { liveUpdateSettings } from './live-update-settings'

const key = generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { format: 'pem', type: 'spki' }, privateKeyEncoding: { format: 'pem', type: 'pkcs8' } }).publicKey
const input = {
  publicKey: key,
  builtInOrder: [1_800_000_000_000, 0],
  apiOrigin: 'https://shop.example.com',
  live: false,
}

describe('liveUpdateSettings', () => {
  it('gives the guard the key as base64 SPKI, the order of the built-in files and the releases URL', () => {
    expect(liveUpdateSettings(input)).toEqual({
      settings: { publicKey: createPublicKey(key).export({ format: 'der', type: 'spki' }).toString('base64'), builtInOrder: '1800000000000,0', releasesUrl: 'https://shop.example.com/api/mobile/releases' },
    })
    expect(liveUpdateSettings({ ...input, apiOrigin: 'http://localhost:3000' }).settings?.releasesUrl).toBe('http://localhost:3000/api/mobile/releases')
  })

  it('leaves the updater out without a key, saying how to turn it on', () => {
    const { publicKey: _, ...noKey } = input
    expect(liveUpdateSettings(noKey)).toEqual({ note: expect.stringContaining('set mobile.publicKey') })
  })

  it('never writes a floor of its own when the built-in files name no build time', () => {
    const { builtInOrder: _, ...noOrder } = input
    expect(liveUpdateSettings(noOrder)).toEqual({ note: expect.stringContaining('name no build time') })
  })

  it('leaves the updater out for an API over plain http to another host', () => {
    expect(liveUpdateSettings({ ...input, apiOrigin: 'http://10.0.2.2:3000' })).toEqual({ note: expect.stringContaining('https only') })
  })

  it('leaves the updater out with --live', () => {
    expect(liveUpdateSettings({ ...input, live: true })).toEqual({})
  })
})
