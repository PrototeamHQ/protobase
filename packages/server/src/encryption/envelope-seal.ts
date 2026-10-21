import { createCipheriv, randomBytes } from 'node:crypto'
import { aadOf, type Binding } from './binding'
import type { EncryptionKey } from './keyring'

/** The envelope's prefix and version: `pbenc:1:<key id>:<base64url of iv, ciphertext and tag>`. */
export const envelopePrefix = 'pbenc:'
export const envelopeVersion = '1'

let seal: (text: string) => Sealed

/**
 * A value sealed by `sealText`, the only thing the record writes accept for an encrypted field: nothing else can make
 * one, so a write path that forgets to encrypt throws instead of storing plaintext.
 */
export class Sealed {
  readonly #text: string

  private constructor(text: string) {
    this.#text = text
  }

  static {
    seal = (text) => new Sealed(text)
  }

  /** The envelope text the column stores. */
  static textOf(value: Sealed) {
    return value.#text
  }
}

/** Seals `plaintext` with AES-256-GCM under `key`, bound to `binding`, with a fresh random IV. */
export const sealText = (key: EncryptionKey, binding: Binding, plaintext: string) => {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key.aes, iv, { authTagLength: 16 })
  cipher.setAAD(aadOf(key.id, binding))
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const payload = Buffer.concat([iv, body, cipher.getAuthTag()]).toString('base64url')
  return seal(`${envelopePrefix}${envelopeVersion}:${key.id}:${payload}`)
}
