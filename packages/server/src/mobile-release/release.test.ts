import { createHash, createPublicKey, generateKeyPairSync, verify, type KeyObject } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { releaseManifestFile, releaseStatementContext, releaseStatementFile } from '@protobase/schema/internal'
import { composeRelease, releaseManifest } from './release'

const text = (value: string) => new TextEncoder().encode(value)
const sha256 = (value: Uint8Array) => createHash('sha256').update(value).digest('hex')
const binding = { order: [1, 0], appId: 'com.example.shop', fingerprint: 'abcdef0123456789', shellVersion: '0.1.0' }
const signing = (key: KeyObject) => ({ key, binding })
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

  it('signs every file, the manifest and the statement too, with the key', () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const release = composeRelease(files, signing(privateKey))
    expect([...release.files.keys()].sort()).toEqual(['assets/app-abc.js', 'index.html', releaseManifestFile, releaseStatementFile].sort())
    for (const file of release.files.values()) expect(verify('sha256', file.content, publicKey, Buffer.from(file.signature!, 'base64'))).toBe(true)
  })

  it('gives the same files another id unsigned, signed with one key and with another', () => {
    const [a, b] = [0, 1].map(() => generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey)
    const ids = new Set([composeRelease(files).bundleId, composeRelease(files, signing(a!)).bundleId, composeRelease(files, signing(b!)).bundleId])
    expect(ids.size).toBe(3)
    expect(composeRelease(files, signing(a!)).bundleId).toBe(composeRelease([...files].reverse(), signing(a!)).bundleId)
  })

  it('states, signed after the context line, what binds the manifest, and hashes the statement and the key into the id', () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const release = composeRelease(files, signing(privateKey))
    const statement = release.files.get(releaseStatementFile)!.content
    const { payload, signature } = JSON.parse(new TextDecoder().decode(statement)) as { payload: string; signature: string }
    const bytes = Buffer.from(payload, 'hex')
    expect(verify('sha256', Buffer.concat([Buffer.from(releaseStatementContext), bytes]), publicKey, Buffer.from(signature, 'hex'))).toBe(true)
    expect(verify('sha256', bytes, publicKey, Buffer.from(signature, 'hex'))).toBe(false)
    expect(JSON.parse(bytes.toString())).toEqual({ manifest: sha256(release.files.get(releaseManifestFile)!.content), ...binding })
    const spki = createPublicKey(privateKey).export({ type: 'spki', format: 'der' })
    expect(release.bundleId).toBe(createHash('sha256').update(statement).update(spki).digest('hex').slice(0, 16))
  })

  it('gives the same files released in another order, or for another app, binary or shell, another id', () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const id = (changes: Partial<typeof binding>) => composeRelease(files, { key: privateKey, binding: { ...binding, ...changes } }).bundleId
    const ids = new Set([id({}), id({ order: [2, 0] }), id({ appId: 'com.example.other' }), id({ fingerprint: '0000000000000000' }), id({ shellVersion: '0.2.0' })])
    expect(ids.size).toBe(5)
  })

  it("refuses an app file with the statement's name, or that starts as a statement's signed bytes do", () => {
    expect(() => composeRelease([{ href: releaseStatementFile, content: text('{}') }])).toThrow(/rename it/)
    expect(() => composeRelease([{ href: 'a.txt', content: text(`${releaseStatementContext}{}`) }])).toThrow(/a\.txt starts as/)
  })

  it("refuses an app file with the manifest's name", () => {
    expect(() => composeRelease([{ href: releaseManifestFile, content: text('[]') }])).toThrow(/rename it/)
  })
})
