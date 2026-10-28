import { decodeKey, encodeKey } from '@protobase/schema/internal'
import { fitsFrame } from '../realtime/broadcast-frame'
import type { Entry, Registry } from '../registry'

/** A record a channel is named by: its resource, its key as the API reads it, and the channel's name, `<resource>/<key>`. */
export type ChannelRecord = { entry: Entry; key: (string | number)[]; name: string }

/**
 * The record `resource` and `key` name, with the key's own text in the name, so `01` and `1` of an integer key name
 * one channel. `undefined` for a resource the app does not have or a key that is not one of its keys, which a join
 * refuses as it refuses a record the caller may not read; `'too-long'` for a name over 255 bytes.
 */
export const channelRecord = (registry: Pick<Registry, 'find'>, resource: string, key: string): ChannelRecord | 'too-long' | undefined => {
  const entry = registry.find(resource)
  if (!entry) return
  const parsed = decodedKey(entry, key)
  if (!parsed) return
  const name = `${resource}/${encodeKey(parsed)}`
  return fitsFrame(name) ? { entry, key: parsed, name } : 'too-long'
}

// `decodeKey` is a pure parser: whatever it throws is a malformed key.
const decodedKey = (entry: Entry, key: string) => {
  try {
    const decoded = decodeKey(key, entry.keyTypes)
    return Array.isArray(decoded) ? decoded : [decoded]
  } catch {
    return
  }
}
