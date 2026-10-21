import { createDecipheriv } from 'node:crypto'
import { aadOf, type Binding } from './binding'
import { envelopePrefix, envelopeVersion } from './envelope-seal'
import type { Keyring } from './keyring'

/** Why a stored value does not open. */
export type UnreadableKind = 'not-encrypted' | 'malformed' | 'unknown-key' | 'failed-authentication'

/** The resource and field a value belongs to, which an error names. */
export type ValueSubject = { resource: string; field: string }

/** A stored value of an encrypted field that does not open. Its message never holds the value. */
export class UnreadableValue extends Error {
  constructor(
    readonly kind: UnreadableKind,
    subject: ValueSubject,
    binding: Binding,
    readonly kid?: string,
  ) {
    super(`${subject.resource}.${subject.field} of record ${JSON.stringify(binding.key)} cannot be decrypted: ${kind}${kid ? ` (key ${kid})` : ''}`)
    this.name = 'UnreadableValue'
  }
}

const ivLength = 12
const tagLength = 16

type Parsed = { kid: string; bytes: Buffer }

// Strict: four parts, the version this code writes, an 8-character id, canonical base64url holding at least an IV and a tag.
const parse = (stored: string): Parsed | 'not-encrypted' | 'malformed' => {
  if (!stored.startsWith(envelopePrefix)) return 'not-encrypted'
  const parts = stored.split(':')
  if (parts.length !== 4 || parts[1] !== envelopeVersion) return 'malformed'
  const [, , kid, payload] = parts as [string, string, string, string]
  if (!/^[A-Za-z0-9_-]{8}$/.test(kid)) return 'malformed'
  const bytes = Buffer.from(payload, 'base64url')
  if (bytes.toString('base64url') !== payload || bytes.length < ivLength + tagLength) return 'malformed'
  return { kid, bytes }
}

// With the key and a 16-byte tag given, final() fails only when the value does not authenticate, with a plain Error and no
// code on Node and Bun alike.
const decrypt = (aes: Buffer, aad: Buffer, bytes: Buffer) => {
  const decipher = createDecipheriv('aes-256-gcm', aes, bytes.subarray(0, ivLength), { authTagLength: tagLength })
  decipher.setAAD(aad)
  decipher.setAuthTag(bytes.subarray(bytes.length - tagLength))
  const body = decipher.update(bytes.subarray(ivLength, bytes.length - tagLength))
  try {
    return Buffer.concat([body, decipher.final()]).toString('utf8')
  } catch (error) {
    if (error instanceof Error) return undefined
    throw error
  }
}

/**
 * The plaintext of `stored`, sealed under `binding` with a key of `keyring`, or an `UnreadableValue` thrown with why it
 * does not open. The only place, with the CLI's status and apply, that decrypts.
 */
export const openText = (keyring: Keyring, binding: Binding, stored: string, subject: ValueSubject) => {
  const parsed = parse(stored)
  if (typeof parsed === 'string') throw new UnreadableValue(parsed, subject, binding)
  const key = keyring.byId.get(parsed.kid)
  if (!key) throw new UnreadableValue('unknown-key', subject, binding, parsed.kid)
  const plaintext = decrypt(key.aes, aadOf(parsed.kid, binding), parsed.bytes)
  if (plaintext === undefined) throw new UnreadableValue('failed-authentication', subject, binding, parsed.kid)
  return plaintext
}

/** The key id an envelope names, or `undefined` for a value that is no envelope this code reads. */
export const envelopeKid = (stored: string) => {
  const parsed = parse(stored)
  return typeof parsed === 'string' ? undefined : parsed.kid
}
