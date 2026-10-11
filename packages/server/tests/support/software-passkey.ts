import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto'
import { isoCBOR } from '@simplewebauthn/server/helpers'

const base64url = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url')
const sha256 = (data: Uint8Array | string) => createHash('sha256').update(data).digest()

/**
 * A passkey held in memory, as an authenticator would: its credential id, the COSE public key Better Auth stores
 * (base64), and answers to sign-in challenges for the RP ID and origin the browser would name.
 */
export const softwarePasskey = () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const jwk = publicKey.export({ format: 'jwk' })
  const cose = isoCBOR.encode(
    new Map<number, number | Uint8Array>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, Buffer.from(jwk.x!, 'base64url')],
      [-3, Buffer.from(jwk.y!, 'base64url')],
    ]),
  )
  const id = base64url(randomBytes(16))
  let counter = 0
  return {
    id,
    publicKey: Buffer.from(cose).toString('base64'),
    /** The browser's answer to `challenge`, signed for `rpId` on `origin`. */
    answer: ({ challenge, rpId, origin }: { challenge: string; rpId: string; origin: string }) => {
      counter += 1
      const authenticatorData = Buffer.concat([sha256(rpId), Buffer.from([0x05]), Buffer.from([0, 0, 0, counter])])
      const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge, origin, crossOrigin: false }))
      const signature = sign('sha256', Buffer.concat([authenticatorData, sha256(clientDataJSON)]), privateKey)
      return {
        id,
        rawId: id,
        type: 'public-key',
        clientExtensionResults: {},
        response: { authenticatorData: base64url(authenticatorData), clientDataJSON: base64url(clientDataJSON), signature: base64url(signature) },
      }
    },
  }
}

export type SoftwarePasskey = ReturnType<typeof softwarePasskey>
