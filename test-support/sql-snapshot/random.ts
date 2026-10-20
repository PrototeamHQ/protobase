import { createHash } from 'node:crypto'
import nodeCrypto from 'node:crypto'
import { syncBuiltinESMExports } from 'node:module'
import { vi } from 'vitest'

// Better Auth's ids, tokens, password salts and signing keys, and anything else drawn from crypto, go into SQL params,
// so record and replay must draw the same values: each test draws from a sequence of its own, seeded with its name, and
// the hooks of a file from another that runs on across them. What only recording does, such as logging in to Postgres,
// draws real randomness instead (`withRealRandomness`), so the sequences stay the same in both.

const real = {
  getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto),
  randomUUID: globalThis.crypto.randomUUID.bind(globalThis.crypto),
  randomBytes: nodeCrypto.randomBytes,
  randomFillSync: nodeCrypto.randomFillSync,
  generateKey: globalThis.crypto.subtle.generateKey.bind(globalThis.crypto.subtle),
}
let realDepth = 0

/** Runs `work` on real randomness: work that recording does and replay does not. */
export const withRealRandomness = async <T>(work: () => Promise<T>) => {
  realDepth++
  try {
    return await work()
  } finally {
    realDepth--
  }
}

const sequence = (seed: string) => {
  let counter = 0
  let pool = Buffer.alloc(0)
  return (length: number) => {
    while (pool.length < length) pool = Buffer.concat([pool, createHash('sha256').update(`${seed}\u0000${counter++}`).digest()])
    const bytes = pool.subarray(0, length)
    pool = pool.subarray(length)
    return Buffer.from(bytes)
  }
}

let draw = sequence('')

const fill = <T extends ArrayBufferView | null>(array: T) => {
  if (realDepth) return real.getRandomValues(array as never) as T
  if (array) new Uint8Array(array.buffer, array.byteOffset, array.byteLength).set(draw(array.byteLength))
  return array
}

const uuid = () => {
  if (realDepth) return real.randomUUID()
  const bytes = draw(16)
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` as `${string}-${string}-${string}-${string}-${string}`
}

const randomBytes = ((size: number, callback?: (error: Error | null, bytes: Buffer) => void) => {
  if (realDepth) return real.randomBytes(size, callback as never)
  const bytes = draw(size)
  if (!callback) return bytes
  queueMicrotask(() => callback(null, bytes))
}) as typeof nodeCrypto.randomBytes

// An Ed25519 private key in PKCS #8 is this prefix and its 32-byte seed.
const ed25519Prefix = Buffer.from('302e020100300506032b657004220420', 'hex')

const base64url = (bytes: Buffer) => bytes.toString('base64url')

// A P-256 key pair whose private scalar is 32 of the sequence's bytes; a draw that is no valid scalar is drawn again.
const p256KeyPair = async (algorithm: EcKeyGenParams, extractable: boolean, usages: KeyUsage[]) => {
  const ecdh = nodeCrypto.createECDH('prime256v1')
  for (;;) {
    const d = draw(32)
    try {
      ecdh.setPrivateKey(d)
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ERR_CRYPTO_INVALID_KEYTYPE') continue
      throw error
    }
    const point = ecdh.getPublicKey()
    const jwk = { kty: 'EC', crv: 'P-256', x: base64url(point.subarray(1, 33)), y: base64url(point.subarray(33, 65)) }
    const { subtle } = globalThis.crypto
    return {
      privateKey: await subtle.importKey('jwk', { ...jwk, d: base64url(d) }, algorithm, extractable, usages.filter((usage) => usage === 'sign')),
      publicKey: await subtle.importKey('jwk', jwk, algorithm, true, usages.filter((usage) => usage === 'verify')),
    }
  }
}

/**
 * Ed25519 and P-256 ECDSA key pairs, the kinds Better Auth signs its tokens with (EdDSA, and ES256 for the
 * GoTrue-compatible endpoints) and stores, made from the sequence's bytes. Other kinds stay random, as signatures are
 * anyway: one that reached SQL would fail replay as a stale snapshot.
 */
const generateKey = (async (algorithm: AlgorithmIdentifier, extractable: boolean, usages: KeyUsage[]) => {
  const name = typeof algorithm === 'string' ? algorithm : algorithm.name
  const ecdsaP256 = name === 'ECDSA' && (algorithm as EcKeyGenParams).namedCurve === 'P-256'
  if (!realDepth && ecdsaP256) return p256KeyPair(algorithm as EcKeyGenParams, extractable, usages)
  if (realDepth || name !== 'Ed25519') return real.generateKey(algorithm as never, extractable, usages)
  const pkcs8 = Buffer.concat([ed25519Prefix, draw(32)])
  const spki = nodeCrypto.createPublicKey(nodeCrypto.createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' })).export({ format: 'der', type: 'spki' })
  const { subtle } = globalThis.crypto
  return {
    privateKey: await subtle.importKey('pkcs8', pkcs8, 'Ed25519', extractable, usages.filter((usage) => usage === 'sign')),
    publicKey: await subtle.importKey('spki', spki, 'Ed25519', true, usages.filter((usage) => usage === 'verify')),
  }
}) as typeof globalThis.crypto.subtle.generateKey

/** Replaces crypto's random sources, the Web Crypto ones and node:crypto's, with seeded sequences. */
export const seedRandomness = () => {
  vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation(fill as never)
  vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(uuid)
  vi.spyOn(nodeCrypto, 'randomBytes').mockImplementation(randomBytes)
  vi.spyOn(nodeCrypto, 'randomUUID').mockImplementation(uuid)
  vi.spyOn(nodeCrypto, 'randomFillSync').mockImplementation(((array: NodeJS.ArrayBufferView) => (realDepth ? real.randomFillSync(array) : fill(array))) as never)
  vi.spyOn(globalThis.crypto.subtle, 'generateKey').mockImplementation(generateKey)
  if (nodeCrypto.webcrypto !== globalThis.crypto) vi.spyOn(nodeCrypto.webcrypto, 'getRandomValues').mockImplementation(fill as never)
  syncBuiltinESMExports()
}

/** Draws from the sequence named `seed` from here on; `restart` begins it again. */
export const useSequence = (() => {
  const sequences = new Map<string, ReturnType<typeof sequence>>()
  return (seed: string, restart = false) => {
    if (restart || !sequences.has(seed)) sequences.set(seed, sequence(seed))
    draw = sequences.get(seed)!
  }
})()
