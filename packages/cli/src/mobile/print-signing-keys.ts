import { generateKeyPairSync } from 'node:crypto'
import { mobileSigningKeyVariable } from '@protobase/server/mobile-release'

/**
 * Prints a fresh RSA key pair for the live updater: the signing key as `PROTOBASE_MOBILE_SIGNING_KEY`, one line with
 * its newlines written `\n` as an env file holds it, and the public key for `mobile.publicKey`, and on `note` where
 * each goes. It reads no project, writes no file and makes no request.
 */
export const printSigningKeys = (out: (text: string) => void, note: (text: string) => void) => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 3072,
    publicKeyEncoding: { format: 'pem', type: 'spki' },
    privateKeyEncoding: { format: 'pem', type: 'pkcs8' },
  })
  out(`${mobileSigningKeyVariable}=${privateKey.trim().replace(/\n/g, '\\n')}\n\n${publicKey}`)
  note(
    `Set ${mobileSigningKeyVariable} on the server, a secret never committed, and the public key as mobile.publicKey in protobase.config.ts. ` +
      'A store release pins the public key: changing it needs a new one.\n',
  )
}
