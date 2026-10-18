import { createHash } from 'node:crypto'
import nodeCrypto from 'node:crypto'
import { syncBuiltinESMExports } from 'node:module'
import { vi } from 'vitest'

// Better Auth's ids, tokens and password salts, and anything else drawn from crypto, go into SQL params, so record and
// replay must draw the same values: each test draws from a sequence of its own, seeded with its name, and the hooks of
// a file from another that runs on across them.

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
  if (array) new Uint8Array(array.buffer, array.byteOffset, array.byteLength).set(draw(array.byteLength))
  return array
}

const uuid = () => {
  const bytes = draw(16)
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` as `${string}-${string}-${string}-${string}-${string}`
}

const randomBytes = ((size: number, callback?: (error: Error | null, bytes: Buffer) => void) => {
  const bytes = draw(size)
  if (!callback) return bytes
  queueMicrotask(() => callback(null, bytes))
}) as typeof nodeCrypto.randomBytes

/** Replaces crypto's random sources, the Web Crypto ones and node:crypto's, with seeded sequences. */
export const seedRandomness = () => {
  vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation(fill as never)
  vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(uuid)
  vi.spyOn(nodeCrypto, 'randomBytes').mockImplementation(randomBytes)
  vi.spyOn(nodeCrypto, 'randomUUID').mockImplementation(uuid)
  vi.spyOn(nodeCrypto, 'randomFillSync').mockImplementation(fill as never)
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
