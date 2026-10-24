import { createCipheriv, createECDH, hkdfSync, randomBytes, type ECDH } from 'node:crypto'

/** The record size the body is one record of. */
const recordSize = 4096
/** The most plaintext one message carries: push services take a body of at most 4096 bytes, of which the 86-byte header, the 16-byte tag and the padding delimiter are not plaintext. */
export const maxPlaintextBytes = recordSize - 86 - 16 - 1

/** A browser's subscription keys, decoded: its P-256 public key and its 16-byte auth secret. */
export type SubscriptionKeys = { p256dh: Buffer; auth: Buffer }

const derived = (ikm: Buffer, salt: Buffer, info: Buffer, length: number) => Buffer.from(hkdfSync('sha256', ikm, salt, info, length))

/**
 * `plaintext` encrypted for one subscription as Web Push's aes128gcm (RFC 8291, RFC 8188): a fresh ephemeral key and a
 * random 16-byte salt for every call, one record with its padding delimiter. `fixed` replaces both, for test vectors
 * only. Throws for a plaintext over `maxPlaintextBytes`.
 */
export const encryptPayload = (plaintext: Buffer, keys: SubscriptionKeys, fixed?: { salt: Buffer; ecdh: ECDH }) => {
  if (plaintext.length > maxPlaintextBytes) throw new Error(`A Web Push payload carries at most ${maxPlaintextBytes} bytes`)
  const salt = fixed?.salt ?? randomBytes(16)
  const ecdh = fixed?.ecdh ?? createECDH('prime256v1')
  const serverPublic = fixed ? ecdh.getPublicKey() : ecdh.generateKeys()
  const secret = ecdh.computeSecret(keys.p256dh)

  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), keys.p256dh, serverPublic])
  const ikm = derived(secret, keys.auth, keyInfo, 32)
  const contentKey = derived(ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16)
  const nonce = derived(ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12)

  const cipher = createCipheriv('aes-128-gcm', contentKey, nonce)
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.update(Buffer.from([2])), cipher.final(), cipher.getAuthTag()])
  const size = Buffer.alloc(4)
  size.writeUInt32BE(recordSize)
  return Buffer.concat([salt, size, Buffer.from([serverPublic.length]), serverPublic, ciphertext])
}
