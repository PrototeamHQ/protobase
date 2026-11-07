import { createPrivateKey, type KeyObject } from 'node:crypto'

/**
 * What the FCM sender signs with, from a service account: its project, its address and its private key as a WebCrypto
 * key that cannot be exported, which prints no key material when logged or serialized.
 */
export type FcmSettings = { projectId: string; clientEmail: string; privateKey: CryptoKey }

export const fcmServiceAccountVariable = 'PROTOBASE_FCM_SERVICE_ACCOUNT'

/** The signature the access token's assertion is signed with: RS256. */
export const rs256 = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' } as const

// Google's project ids: 6 to 30 lowercase letters, digits and hyphens, starting with a letter, which keeps the send
// URL's path to the one it names.
const projectId = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/
const address = /^[^\s@]+@[^\s@]+$/
const minModulusBits = 2048

const invalid = (problem: string) => new Error(`${fcmServiceAccountVariable} ${problem}; set it to the JSON of a service account key from the Firebase project's settings`)

const parsed = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch (error) {
    // The parser's message quotes the text, which holds the key.
    if (error instanceof SyntaxError) throw invalid('is not JSON')
    throw error
  }
}

// The key, or undefined when the text is none the runtime reads; its own errors may quote the text.
const keyOf = (text: string): KeyObject | undefined => {
  try {
    return createPrivateKey(text)
  } catch (error) {
    if (error instanceof Error && 'code' in error && typeof error.code === 'string' && /^ERR_(OSSL|INVALID_ARG)/.test(error.code)) return
    throw error
  }
}

/**
 * The FCM settings from `PROTOBASE_FCM_SERVICE_ACCOUNT`, a service account key's JSON; `undefined` when it is unset or
 * blank, which turns FCM off. JSON that is not a service account's, a project id that is not one, or a private key
 * that is not an RSA key of at least 2048 bits is a configuration error naming the variable, never its value, so the
 * server stops at startup. The JSON's `token_uri` and other URLs are not read: the sender only ever reaches Google's
 * own token endpoint and FCM.
 */
export const readFcmSettings = (env: Record<string, string | undefined>): FcmSettings | undefined => {
  const text = env[fcmServiceAccountVariable]?.trim()
  if (!text) return
  const account = parsed(text)
  if (typeof account !== 'object' || account === null || Array.isArray(account)) throw invalid('is not a JSON object')
  const { type, project_id, client_email, private_key } = account as Record<string, unknown>
  if (type !== 'service_account') throw invalid('is not a service account key: its type is not service_account')
  if (typeof project_id !== 'string' || !projectId.test(project_id)) throw invalid('has no project_id that is a Google project id')
  if (typeof client_email !== 'string' || !address.test(client_email)) throw invalid('has no client_email that is an address')
  const key = typeof private_key === 'string' ? keyOf(private_key) : undefined
  if (!key || key.type !== 'private' || key.asymmetricKeyType !== 'rsa') throw invalid('has no private_key that is an RSA private key')
  if ((key.asymmetricKeyDetails?.modulusLength ?? 0) < minModulusBits) throw invalid(`has a private_key under ${minModulusBits} bits`)
  return { projectId: project_id, clientEmail: client_email, privateKey: key.toCryptoKey(rs256, false, ['sign']) }
}
