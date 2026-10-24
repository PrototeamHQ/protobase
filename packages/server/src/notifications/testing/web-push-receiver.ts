import { createDecipheriv, createECDH, hkdfSync, randomBytes } from 'node:crypto'

const derived = (ikm: Buffer, salt: Buffer, info: Buffer, length: number) => Buffer.from(hkdfSync('sha256', ikm, salt, info, length))

/** A browser's side of a subscription, for tests: its keys as a device stores them, and what decrypts a body for it. */
export const webPushReceiver = () => {
  const ecdh = createECDH('prime256v1')
  const publicKey = ecdh.generateKeys()
  const auth = randomBytes(16)

  /** The plaintext of an aes128gcm body (RFC 8291), as a browser decrypts it; throws when it is not for these keys. */
  const decrypt = (body: Uint8Array) => {
    const bytes = Buffer.from(body)
    const salt = bytes.subarray(0, 16)
    const idLength = bytes[20]!
    const serverPublic = bytes.subarray(21, 21 + idLength)
    const sealed = bytes.subarray(21 + idLength)
    const secret = ecdh.computeSecret(serverPublic)
    const ikm = derived(secret, auth, Buffer.concat([Buffer.from('WebPush: info\0'), publicKey, serverPublic]), 32)
    const key = derived(ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16)
    const nonce = derived(ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12)
    const decipher = createDecipheriv('aes-128-gcm', key, nonce)
    decipher.setAuthTag(sealed.subarray(sealed.length - 16))
    const padded = Buffer.concat([decipher.update(sealed.subarray(0, sealed.length - 16)), decipher.final()])
    return padded.subarray(0, padded.lastIndexOf(2)).toString()
  }

  return { p256dh: publicKey.toString('base64url'), auth: auth.toString('base64url'), decrypt, header: (body: Uint8Array) => ({ salt: Buffer.from(body).subarray(0, 16).toString('hex'), key: Buffer.from(body).subarray(21, 86).toString('hex') }) }
}
