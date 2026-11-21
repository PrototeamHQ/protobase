import { generateKeyPairSync, sign } from 'node:crypto'
import type { CertificateSource } from '../sns-certificates'
import { snsMessage, snsStringToSign } from '../sns-message'

/**
 * A stand-in for SNS's signing key: the recorded messages carry the placeholder signatures of the published examples,
 * so a test signs them again with this key, and `certificates` serves its public key at any address, counting fetches.
 */
export const testSnsSigner = () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const fetched: string[] = []
  const certificates: CertificateSource = async (url) => {
    fetched.push(url)
    return publicKey.export({ type: 'spki', format: 'pem' }).toString()
  }
  const signed = <M extends { SignatureVersion: string }>(message: M): M => ({
    ...message,
    Signature: sign(message.SignatureVersion === '1' ? 'sha1' : 'sha256', Buffer.from(snsStringToSign(snsMessage.parse(message))), privateKey).toString('base64'),
  })
  return { signed, certificates, fetched }
}
