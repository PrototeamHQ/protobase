import { canonicalJson } from './canonical'
import type { InputPath } from './read-tracker'
import type { SecretNamer } from './secret-names'

/** Which part of the input a cache key covers: the values a step read, its whole input, or the value of a key function. */
export type KeyShape = { reads: InputPath[] } | { input: true } | { custom: true }

/** Whether a path is in the input, and its value there, through own properties only. */
const at = (input: unknown, path: InputPath): [boolean, unknown] => {
  let value = input
  for (const key of path) {
    if (typeof value !== 'object' || value === null || !Object.hasOwn(value, key)) return [false, null]
    value = (value as Record<string, unknown>)[key]
  }
  return [true, value]
}

const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('')

/**
 * The cache key of one call of a step type for one shape: the SHA-256 of the type, the shape and the values it covers,
 * as canonical JSON with each secret written as its name, and the names of the secrets it held. `value` is the input,
 * or for a `custom` shape the key function's value. Undefined when the value has no JSON form.
 */
export const cacheKey = async (type: string, shape: KeyShape, value: unknown, nameSecrets: SecretNamer) => {
  const covered = 'reads' in shape ? shape.reads.map((path) => [path, ...at(value, path)]) : value
  let named: ReturnType<SecretNamer>
  let text: string
  try {
    named = nameSecrets(covered)
    text = canonicalJson({ v: 1, type, shape, value: named.value })
  } catch (error) {
    // A value with no JSON form, such as a function, a bigint or one that holds itself.
    if (error instanceof TypeError || error instanceof RangeError) return
    throw error
  }
  return { key: hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), secrets: named.secrets }
}
