import { createECDH, createHash, createPrivateKey, createPublicKey, randomBytes, sign } from 'node:crypto'
import { isoCBOR } from '@simplewebauthn/server/helpers'

const base64url = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url')
const sha256 = (data: Uint8Array | string) => createHash('sha256').update(data).digest()

/** A P-256 key pair from `randomBytes`, so a test that seeds it gets the same passkey every run. */
const p256KeyPair = () => {
  const d = randomBytes(32)
  const point = createECDH('prime256v1')
  point.setPrivateKey(d)
  const xy = point.getPublicKey()
  const privateKey = createPrivateKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', d: base64url(d), x: base64url(xy.subarray(1, 33)), y: base64url(xy.subarray(33)) } })
  return { privateKey, publicKey: createPublicKey(privateKey) }
}

/**
 * A passkey held in memory, as an authenticator would: its credential id, the COSE public key Better Auth stores
 * (base64), and answers to registration and sign-in challenges for the RP ID and origin the browser would name; an
 * origin left out is missing from the answer.
 */
export const softwarePasskey = () => {
  const { privateKey, publicKey } = p256KeyPair()
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
  const rawId = randomBytes(16)
  const id = base64url(rawId)
  let counter = 0
  const clientData = (type: string, challenge: string, origin: string | undefined) => Buffer.from(JSON.stringify({ type, challenge, ...(origin !== undefined && { origin }), crossOrigin: false }))
  return {
    id,
    publicKey: Buffer.from(cose).toString('base64'),
    /** The browser's answer to a registration's `challenge`, for `rpId` on `origin`, without attestation (`none`). */
    register: ({ challenge, rpId, origin }: { challenge: string; rpId: string; origin?: string }) => {
      const length = Buffer.alloc(2)
      length.writeUInt16BE(rawId.length)
      // Flags: user present, user verified, attested credential data.
      const authData = Buffer.concat([sha256(rpId), Buffer.from([0x45]), Buffer.alloc(4), Buffer.alloc(16), length, rawId, Buffer.from(cose)])
      const attestationObject = isoCBOR.encode(new Map<string, string | Map<string, string> | Uint8Array>([['fmt', 'none'], ['attStmt', new Map<string, string>()], ['authData', authData]]))
      return {
        id,
        rawId: id,
        type: 'public-key',
        clientExtensionResults: {},
        response: { attestationObject: base64url(attestationObject), clientDataJSON: base64url(clientData('webauthn.create', challenge, origin)), transports: ['internal'] },
      }
    },
    /** The browser's answer to a sign-in's `challenge`, signed for `rpId` on `origin`. */
    answer: ({ challenge, rpId, origin }: { challenge: string; rpId: string; origin?: string }) => {
      counter += 1
      const authenticatorData = Buffer.concat([sha256(rpId), Buffer.from([0x05]), Buffer.from([0, 0, 0, counter])])
      const clientDataJSON = clientData('webauthn.get', challenge, origin)
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
