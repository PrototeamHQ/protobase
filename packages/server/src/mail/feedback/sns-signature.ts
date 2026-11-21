import { verify } from 'node:crypto'
import type { CertificateSource } from './sns-certificates'
import { isSnsUrl, snsStringToSign, type SnsMessage } from './sns-message'

/**
 * Whether `message` carries SNS's signature: its certificate is on an SNS host, and the signature, SHA1withRSA for
 * version 1 or SHA256withRSA for version 2, checks out over its signed fields with that certificate's key.
 */
export const hasSnsSignature = async (message: SnsMessage, certificates: CertificateSource) => {
  if (!isSnsUrl(message.SigningCertURL) || !new URL(message.SigningCertURL).pathname.endsWith('.pem')) return false
  const pem = await certificates(message.SigningCertURL)
  const algorithm = message.SignatureVersion === '1' ? 'sha1' : 'sha256'
  return verify(algorithm, Buffer.from(snsStringToSign(message)), pem, Buffer.from(message.Signature, 'base64'))
}
