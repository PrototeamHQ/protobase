import type { Signer } from '../files/signer'
import { expiredSignature, invalidSignature } from './storage-error'

/** What a signed URL lets anyone with it do until `expires` (Unix seconds): read one object, or upload it. */
export type DownloadGrant = { bucket: string; name: string; expires: number }
export type UploadGrant = { bucket: string; name: string; owner: string | null; upsert: boolean; expires: number }

type Grants = { 'storage-download': DownloadGrant; 'storage-upload': UploadGrant }

// Base64url of the grant's JSON, with Web APIs only, as the server runs where there is no Buffer.
const encode = (value: unknown) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value)))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')

const decode = (text: string): unknown => {
  if (!/^[\w-]+$/.test(text)) return undefined
  try {
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(text.replaceAll('-', '+').replaceAll('_', '/')), (char) => char.charCodeAt(0))))
  } catch (error) {
    if (error instanceof SyntaxError || (error instanceof DOMException && error.name === 'InvalidCharacterError')) return undefined
    throw error
  }
}

/** The `token` of a signed URL: the grant and the signature over it, both URL-safe, joined by `.`. */
export const signGrant = async <P extends keyof Grants>(signer: Signer, purpose: P, grant: Grants[P]) =>
  `${encode(grant)}.${await signer.sign(purpose, [grant])}`

/**
 * The grant of a token signed for `purpose`, when it is for the object at `bucket` and `name` and has not expired at
 * `now`; else 400 `InvalidSignature` or `ExpiredToken`, as Supabase Storage answers.
 */
export const readGrant = async <P extends keyof Grants>(signer: Signer, purpose: P, token: string, object: { bucket: string; name: string }, now = Date.now()): Promise<Grants[P]> => {
  const [payload = '', signature = ''] = token.split('.')
  const grant = decode(payload) as Grants[P] | undefined
  if (typeof grant !== 'object' || grant === null || !(await signer.verify(purpose, [grant], signature))) throw invalidSignature()
  if (grant.bucket !== object.bucket || grant.name !== object.name) throw invalidSignature()
  if (grant.expires * 1000 < now) throw expiredSignature()
  return grant
}
