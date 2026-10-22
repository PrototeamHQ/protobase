import { createHash, generateKeyPairSync, verify } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { releaseManifestFile } from '@protobase/schema/internal'
import { composeRelease, releaseManifest } from './release'

const text = (value: string) => new TextEncoder().encode(value)
const sha256 = (value: Uint8Array) => createHash('sha256').update(value).digest('hex')
const files = [
  { href: 'index.html', content: text('<!doctype html>') },
  { href: 'assets/app-abc.js', content: text('console.log(1)') },
]

describe('releaseManifest', () => {
  it('lists each file by href with its sha256 in hex and its size', () => {
    expect(releaseManifest(files)).toEqual([
      { href: 'assets/app-abc.js', checksum: sha256(text('console.log(1)')), sizeInBytes: 14 },
      { href: 'index.html', checksum: sha256(text('<!doctype html>')), sizeInBytes: 15 },
    ])
  })
})

describe('composeRelease', () => {
  it('serves the manifest beside the files, each with its checksum, under an id that follows the files', () => {
    const release = composeRelease(files)
    const manifest = release.files.get(releaseManifestFile)!
    expect(JSON.parse(new TextDecoder().decode(manifest.content))).toEqual(releaseManifest(files))
    expect(manifest.checksum).toBe(sha256(manifest.content))
    expect(release.files.get('index.html')).toEqual({ content: files[0]!.content, checksum: sha256(files[0]!.content) })
    expect(release.bundleId).toMatch(/^[0-9a-f]{16}$/)
    expect(composeRelease([...files].reverse()).bundleId).toBe(release.bundleId)
    expect(composeRelease([files[0]!, { href: 'assets/app-abc.js', content: text('console.log(2)') }]).bundleId).not.toBe(release.bundleId)
  })

  it('signs every file, the manifest too, with the key', () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const release = composeRelease(files, privateKey)
    for (const file of release.files.values()) expect(verify('sha256', file.content, publicKey, Buffer.from(file.signature!, 'base64'))).toBe(true)
  })

  it('gives the same files another id unsigned, signed with one key and with another', () => {
    const [a, b] = [0, 1].map(() => generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey)
    const ids = new Set([composeRelease(files).bundleId, composeRelease(files, a).bundleId, composeRelease(files, b).bundleId])
    expect(ids.size).toBe(3)
    expect(composeRelease(files, a).bundleId).toBe(composeRelease([...files].reverse(), a).bundleId)
  })

  it("refuses an app file with the manifest's name", () => {
    expect(() => composeRelease([{ href: releaseManifestFile, content: text('[]') }])).toThrow(/rename it/)
  })
})
