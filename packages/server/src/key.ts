import type { Context } from 'hono'
import { decodeKey } from '@protobase/schema'
import { badRequest } from './problem'
import type { Entry } from './registry'

/** Decodes key text (`a,b` for composite keys, parts percent-encoded). decodeKey is a pure parser: every error it throws is a malformed key. */
export const decodeKeyText = (entry: Entry, raw: string): (string | number)[] => {
  try {
    const key = decodeKey(raw, entry.keyTypes)
    return Array.isArray(key) ? key : [key]
  } catch {
    throw badRequest('invalid-key', `"${raw}" is not a valid ${entry.name} key`)
  }
}

/**
 * The key from the `:key` path segment, minus a custom method `suffix` such as `:undelete`. A single key is Hono's decoded
 * param; composite parts stay percent-encoded so an encoded comma inside a part survives.
 */
export const keyFromPath = (c: Context, entry: Entry, suffix = '') => {
  const segment = entry.keyTypes.length === 1 ? c.req.param('key')! : new URL(c.req.url).pathname.split('/').pop()!
  return decodeKeyText(entry, suffix && segment.endsWith(suffix) ? segment.slice(0, -suffix.length) : segment)
}
