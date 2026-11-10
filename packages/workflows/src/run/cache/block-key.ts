import { blockReads } from '../../definition/block-reads'
import type { BlockState } from '../../definition/types'
import { canonicalJson } from './canonical'
import { at, cacheKey } from './cache-key'
import type { SecretNamer } from './secret-names'

const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('')

/** The cache type of a Block: its processor's SHA-256, so its entries are its own and a changed block starts afresh. */
export const blockType = async (state: BlockState) => `block:${hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(state.Processor))))}`

/**
 * The cache key of one visit of a Block, as `cacheKey` makes it: over the values of its input (`args`) that its steps
 * read, by path, and the names of the secrets they read, or over the value of its `Key` when it has one (`custom`).
 * `secrets` names every secret the entry depends on, whose change the store tells. Undefined when the value has no JSON form.
 */
export const blockKey = async (state: BlockState, args: unknown, custom: { value: unknown } | undefined, nameSecrets: SecretNamer) => {
  const type = await blockType(state)
  const reads = blockReads(state.Processor)
  const value = custom ? { key: custom.value ?? null } : { input: reads.input.map((path) => [path, ...at(args, path)]), secrets: reads.secrets }
  const key = await cacheKey(type, { custom: true }, value, nameSecrets)
  if (!key) return
  return { type, key: key.key, secrets: [...new Set([...key.secrets, ...reads.secrets])].sort() }
}
