import { sha256Hex } from '../../hash'

// A personal access token is the app's prefix, a random part and a checksum of both, all in base62 after the prefix,
// so a double-click selects the whole token and a scanner can tell one apart from other text.
const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

/** Characters of the random part: about 238 bits, beyond any guessing. */
export const randomLength = 40
/** Characters of the checksum: a CRC-32 in base62, which needs 6. */
export const checksumLength = 6

/** What a prefix may be: lowercase letters, digits and underscores, ending in `_`, such as `invoices_`. */
export const prefixPattern = /^[a-z0-9_]+_$/

// The CRC-32 (IEEE) table, made once; Web Crypto has no CRC, and the server runs where node:zlib does not.
const crcTable = Array.from({ length: 256 }, (_, index) => {
  let crc = index
  for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
  return crc >>> 0
})

const crc32 = (text: string) => {
  let crc = 0xffffffff
  for (const byte of new TextEncoder().encode(text)) crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

const base62 = (value: number, length: number) => {
  let text = ''
  for (let rest = value; rest > 0; rest = Math.floor(rest / 62)) text = alphabet[rest % 62] + text
  return text.padStart(length, '0')
}

/** The checksum of a token's prefix and random part. */
export const checksumOf = (body: string) => base62(crc32(body), checksumLength)

// Random base62 characters without bias: a byte counts only below 248, the largest multiple of 62 a byte holds.
const randomPart = () => {
  let text = ''
  while (text.length < randomLength) {
    for (const byte of crypto.getRandomValues(new Uint8Array(randomLength))) {
      if (byte < 248 && text.length < randomLength) text += alphabet[byte % 62]
    }
  }
  return text
}

/** A new token with `prefix`. */
export const newToken = (prefix: string) => {
  const body = `${prefix}${randomPart()}`
  return `${body}${checksumOf(body)}`
}

const base62Only = new RegExp(`^[${alphabet}]{${randomLength + checksumLength}}$`)

/**
 * Whether `token` has the shape of one of this app's tokens: its prefix, a random part of the right length and the
 * checksum of both. A token that fails is refused without reading the store.
 */
export const isWellFormed = (token: string, prefix: string) => {
  if (!token.startsWith(prefix)) return false
  const rest = token.slice(prefix.length)
  if (!base62Only.test(rest)) return false
  return checksumOf(token.slice(0, -checksumLength)) === token.slice(-checksumLength)
}

/** What the store keeps of a token, and finds it by: the hex SHA-256 of the whole token. */
export const tokenHash = (token: string) => sha256Hex(token)
