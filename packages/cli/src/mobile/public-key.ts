import { createPublicKey } from 'node:crypto'

const minimumBits = 2048

// One public key block, SPKI, as `protobase mobile keys` prints it; never a private key, which belongs on the server.
const publicPem = /^-----BEGIN PUBLIC KEY-----\s+[A-Za-z0-9+/=\s]+-----END PUBLIC KEY-----$/

// OpenSSL's decoding errors name no part of the key, but neither do they say which setting: ours does.
const parse = (pem: string) => {
  try {
    return createPublicKey(pem)
  } catch (error) {
    if (error instanceof Error && String((error as NodeJS.ErrnoException).code).startsWith('ERR_OSSL_')) return
    throw error
  }
}

/**
 * The live updater's key from `mobile.publicKey`, as the Android guard reads it: base64 SPKI DER. A PEM RSA public key
 * of at least 2048 bits; anything else is an error naming what to set.
 */
export const updaterPublicKey = (value: unknown) => {
  const fix = 'set mobile.publicKey to the public key protobase mobile keys prints'
  if (typeof value !== 'string' || !publicPem.test(value.trim())) throw new Error(`mobile.publicKey must be a PEM public key, from -----BEGIN PUBLIC KEY----- to its END line: ${fix}`)
  const key = parse(value.trim())
  if (!key) throw new Error(`mobile.publicKey is no public key: ${fix}`)
  if (key.asymmetricKeyType !== 'rsa') throw new Error(`mobile.publicKey must be an RSA key, not ${key.asymmetricKeyType ?? 'another kind'}: ${fix}`)
  const bits = key.asymmetricKeyDetails?.modulusLength ?? 0
  if (bits < minimumBits) throw new Error(`mobile.publicKey must be an RSA key of at least ${minimumBits} bits, not ${bits}: ${fix}`)
  return key.export({ format: 'der', type: 'spki' }).toString('base64')
}
