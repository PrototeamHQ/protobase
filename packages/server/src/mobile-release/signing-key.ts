import { createPrivateKey, type KeyObject } from 'node:crypto'

/**
 * The environment variable holding the RSA private key, PEM, that signs every file of the mobile release, for an app
 * whose updater has the matching public key. The key is whoever deploys the app's: the signature guards the way from
 * the server to the device (proxies, a CDN, a router), not a server that is broken into.
 */
export const mobileSigningKeyVariable = 'PROTOBASE_MOBILE_SIGNING_KEY'

const minimumBits = 2048

/**
 * The signing key in `PROTOBASE_MOBILE_SIGNING_KEY`, `undefined` when it is unset. Its newlines may be written `\n`, as
 * in an env file that holds one line per value. A key that is not PEM, not RSA or under 2048 bits stops startup.
 */
export const readSigningKey = (env: Record<string, string | undefined>): KeyObject | undefined => {
  const value = env[mobileSigningKeyVariable]?.trim()
  if (!value) return undefined
  const key = parsePrivateKey(value.replace(/\\n/g, '\n'))
  if (key.asymmetricKeyType !== 'rsa') throw new Error(`${mobileSigningKeyVariable} must be an RSA private key, which the app's updater verifies, not ${key.asymmetricKeyType ?? 'another kind of key'}`)
  const bits = key.asymmetricKeyDetails?.modulusLength ?? 0
  if (bits < minimumBits) throw new Error(`${mobileSigningKeyVariable} must be an RSA key of at least ${minimumBits} bits, not ${bits}`)
  return key
}

// OpenSSL's decoding errors name no part of the key, but neither do they say which variable: ours does.
const parsePrivateKey = (pem: string) => {
  try {
    return createPrivateKey(pem)
  } catch (error) {
    if (error instanceof Error && String((error as NodeJS.ErrnoException).code).startsWith('ERR_OSSL_')) {
      throw new Error(`${mobileSigningKeyVariable} is no PEM private key: give the whole key, from -----BEGIN PRIVATE KEY----- to its END line`)
    }
    throw error
  }
}
