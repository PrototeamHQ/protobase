import { createPrivateKey, type KeyObject } from 'node:crypto'

/**
 * The APNs token-authentication key (a `.p8` key from an Apple developer account), its key id and the team id the APNs
 * sender signs with. The key is a `KeyObject`, which prints no key material when logged or serialized.
 */
export type ApnsSettings = { key: KeyObject; keyId: string; teamId: string }

export const apnsKeyVariable = 'PROTOBASE_APNS_KEY'
export const apnsKeyIdVariable = 'PROTOBASE_APNS_KEY_ID'
export const apnsTeamIdVariable = 'PROTOBASE_APNS_TEAM_ID'
const variables = [apnsKeyVariable, apnsKeyIdVariable, apnsTeamIdVariable]

// Apple's key ids and team ids: ten uppercase letters and digits.
const appleId = /^[A-Z0-9]{10}$/

// A PEM whose line breaks were lost, such as one pasted into a single-line field, rebuilt with them: the base64
// between its BEGIN and END lines, with any spaces or line breaks dropped, in lines of 64. Other text is kept as is.
const pem = /^-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*)-----END \1-----$/
export const pemWithLineBreaks = (text: string) => {
  const match = pem.exec(text.trim())
  if (!match) return text
  const [, label, body] = match
  const lines = body!.replace(/\s/g, '').match(/.{1,64}/g) ?? []
  return [`-----BEGIN ${label}-----`, ...lines, `-----END ${label}-----`, ''].join('\n')
}

// The key as a `KeyObject`, or `undefined` when the text is no private key. Node and Bun reject one with an error
// whose code is an `ERR_` one, which carries OpenSSL's reason only; anything else is unexpected and passed on.
const parsedKey = (text: string) => {
  try {
    return createPrivateKey(pemWithLineBreaks(text))
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code
    if (typeof code === 'string' && code.startsWith('ERR_')) return
    throw error
  }
}

/**
 * The APNs settings from `PROTOBASE_APNS_KEY` (the `.p8` file's text), `PROTOBASE_APNS_KEY_ID` and
 * `PROTOBASE_APNS_TEAM_ID`; the key may have lost its line breaks, pasted on one line. `undefined` when none is set, which turns APNs off. A blank variable counts as unset. Some
 * set but not all, a key that is no P-256 private key, or an id that is not ten letters and digits is a configuration
 * error naming the variable, never its value, so the server stops at startup.
 */
export const readApnsSettings = (env: Record<string, string | undefined>): ApnsSettings | undefined => {
  const [keyText, keyId, teamId] = variables.map((name) => env[name]?.trim() || undefined)
  if (!keyText && !keyId && !teamId) return
  const missing = variables.filter((name) => !env[name]?.trim())
  if (missing.length > 0) throw new Error(`${missing.join(' and ')} must be set for APNs, with ${variables.filter((name) => !missing.includes(name)).join(' and ')}; set all three, or none to turn APNs off`)

  const key = parsedKey(keyText!)
  if (key?.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') throw new Error(`${apnsKeyVariable} is not an APNs key: set it to the text of the .p8 file, from -----BEGIN PRIVATE KEY----- to -----END PRIVATE KEY-----, with its line breaks or on one line`)
  if (!appleId.test(keyId!)) throw new Error(`${apnsKeyIdVariable} is not an APNs key id: ten uppercase letters and digits, as the developer account shows it`)
  if (!appleId.test(teamId!)) throw new Error(`${apnsTeamIdVariable} is not a team id: ten uppercase letters and digits, as the developer account shows it`)
  return { key, keyId: keyId!, teamId: teamId! }
}
