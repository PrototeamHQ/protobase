import { createECDH, ECDH } from 'node:crypto'

const curve = 'prime256v1'
const base64url = /^[A-Za-z0-9_-]+$/

/** The bytes of unpadded base64url text, or `undefined` for anything else. */
export const fromBase64url = (text: unknown) => (typeof text === 'string' && base64url.test(text) ? Buffer.from(text, 'base64url') : undefined)

/** Whether `bytes` is a P-256 public key, an uncompressed point on the curve, as browsers and VAPID give it. */
export const isPublicPoint = (bytes: Buffer | undefined): bytes is Buffer => {
  if (bytes?.length !== 65 || bytes[0] !== 0x04) return false
  try {
    ECDH.convertKey(bytes, curve)
    return true
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ERR_CRYPTO_OPERATION_FAILED') return false
    throw error
  }
}

/** Whether `text` is a P-256 public key in base64url. */
export const isPublicKey = (text: unknown) => isPublicPoint(fromBase64url(text))

/** The public key of a P-256 private key, or `undefined` when the bytes are none. */
export const publicKeyOf = (privateKey: Buffer) => {
  if (privateKey.length !== 32) return undefined
  const ecdh = createECDH(curve)
  try {
    ecdh.setPrivateKey(privateKey)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ERR_CRYPTO_INVALID_KEYTYPE') return undefined
    throw error
  }
  return ecdh.getPublicKey()
}

/** A private key as 32 bytes: the runtime gives a key with leading zero bytes shorter. */
export const padPrivateKey = (privateKey: Buffer) => Buffer.concat([Buffer.alloc(32 - privateKey.length), privateKey])

/** A fresh VAPID key pair, both in base64url, for `PROTOBASE_VAPID_PUBLIC_KEY` and `PROTOBASE_VAPID_PRIVATE_KEY`. */
export const generateVapidKeys = () => {
  const ecdh = createECDH(curve)
  const publicKey = ecdh.generateKeys()
  return { publicKey: publicKey.toString('base64url'), privateKey: padPrivateKey(ecdh.getPrivateKey()).toString('base64url') }
}
