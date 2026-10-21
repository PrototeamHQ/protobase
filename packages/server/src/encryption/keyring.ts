import { createHmac } from 'node:crypto'

/** One root key, as the AES key derived from it and the id envelopes name it by. */
export type EncryptionKey = { id: string; aes: Buffer }

/** The key new values are sealed with, and every key a stored value may name, by id. */
export type Keyring = { current: EncryptionKey; byId: ReadonlyMap<string, EncryptionKey> }

type Env = Record<string, string | undefined>

const currentVariable = 'PROTOBASE_ENCRYPTION_KEY'
const previousVariable = 'PROTOBASE_ENCRYPTION_PREVIOUS_KEYS'

// Domain separation: the AES key and the id come from the root key under labels of their own.
const derive = (root: Buffer, label: string) => createHmac('sha256', root).update(label).digest()

const keyOf = (root: Buffer): EncryptionKey => ({
  id: derive(root, 'protobase field encryption key id').toString('base64url').slice(0, 8),
  aes: derive(root, 'protobase field encryption key v1'),
})

type Entry = { text: string; where: string }

// Padded standard base64 of exactly 32 bytes, as `openssl rand -base64 32` prints: decoding is lenient, so the decoded
// bytes must encode back to the same text.
const rootOf = ({ text, where }: Entry) => {
  if (text === '') throw new Error(`${where} is empty`)
  const bytes = Buffer.from(text, 'base64')
  if (bytes.toString('base64') !== text || bytes.length !== 32) throw new Error(`${where} is not 32 bytes in standard base64, such as the output of openssl rand -base64 32`)
  if (bytes.every((byte) => byte === bytes[0])) throw new Error(`${where} is 32 identical bytes, not a random key`)
  return bytes
}

const entriesOf = (env: Env): Entry[] => {
  const current = { text: (env[currentVariable] ?? '').trim(), where: currentVariable }
  const previous = env[previousVariable]
  if (previous === undefined || previous.trim() === '') return [current]
  return [current, ...previous.split(',').map((text, i) => ({ text: text.trim(), where: `${previousVariable} entry ${i + 1}` }))]
}

// Rotating a sign-in or API secret must not lose data, nor losing one expose it: the key is never one of them.
const checkApart = (entries: Entry[], env: Env) => {
  for (const name of ['BETTER_AUTH_SECRET', 'PROTOBASE_SECRET_KEY']) {
    const secret = env[name]?.trim()
    const same = secret && entries.find((entry) => entry.text === secret)
    if (same) throw new Error(`${same.where} is the same as ${name}: give encryption a key of its own`)
  }
}

/**
 * The keys from `PROTOBASE_ENCRYPTION_KEY` and the comma separated `PROTOBASE_ENCRYPTION_PREVIOUS_KEYS`. Throws on a key
 * that is not 32 random bytes in base64, a key given twice, or one that is the sign-in or API secret, naming the
 * variable and the entry, never the key.
 */
export const encryptionKeyring = (env: Env): Keyring => {
  const entries = entriesOf(env)
  checkApart(entries, env)
  const byId = new Map<string, EncryptionKey>()
  const seen = new Set<string>()
  for (const entry of entries) {
    const root = rootOf(entry)
    if (seen.has(root.toString('base64'))) throw new Error(`${entry.where} is a key given before`)
    seen.add(root.toString('base64'))
    const key = keyOf(root)
    if (byId.has(key.id)) throw new Error(`${entry.where} has the same key id as a key given before`)
    byId.set(key.id, key)
  }
  return { current: byId.values().next().value!, byId }
}
