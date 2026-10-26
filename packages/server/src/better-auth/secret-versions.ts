import { createHash } from 'node:crypto'

/** Better Auth's versioned secrets: the current one first, each with the version its ciphertexts name. */
export type VersionedSecret = { version: number; value: string }

// A secret's version comes from the secret itself, so a secret keeps it whatever the order of `previousSecrets`, and
// whichever instance encrypted with it. 28 bits keep it a small integer; two secrets of one app sharing one is
// vanishingly unlikely, and Better Auth refuses the duplicate at start.
const versionOf = (secret: string) => Number.parseInt(createHash('sha256').update(`protobase-secret-version:${secret}`).digest('hex').slice(0, 7), 16)

/**
 * Better Auth's options for the app's `secret` and its `previousSecrets`: `secrets`, which encrypt with the current
 * one and decrypt with any of them, and `secret`, which Better Auth keeps for what was encrypted before secrets had
 * versions. That is the oldest secret listed: the one in use when the app last ran without versions, unless it was
 * changed since without being listed.
 */
export const versionedSecrets = (secret: string, previousSecrets: string[] = []) => {
  const all = [...new Set([secret, ...previousSecrets])]
  return { secrets: all.map((value): VersionedSecret => ({ version: versionOf(value), value })), legacySecret: all.at(-1)! }
}
