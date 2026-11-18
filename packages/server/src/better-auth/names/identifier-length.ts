import { createHash } from 'node:crypto'

// Postgres keeps the first 63 bytes of an identifier and drops the rest without a word, so two long names could end up
// the same. A name the config gives is refused past it; a name Protobase makes from others is shortened instead.

/** The longest identifier Postgres keeps whole, in bytes (NAMEDATALEN - 1). */
export const maxIdentifierBytes = 63

const bytes = (text: string) => Buffer.byteLength(text, 'utf8')

/** Refuses a name the config gives that Postgres would cut, or an empty one, naming the setting it came from. */
export const checkConfiguredName = (name: string, setting: string) => {
  if (name === '') throw new Error(`${setting} is empty: give it a name`)
  if (bytes(name) > maxIdentifierBytes) throw new Error(`${setting} "${name}" is ${bytes(name)} bytes, past the ${maxIdentifierBytes} Postgres keeps: give it a shorter name`)
}

// The longest start of `text` within `limit` bytes, whole characters only.
const startWithin = (text: string, limit: number) => {
  let start = ''
  for (const character of text) {
    if (bytes(start + character) > limit) break
    start += character
  }
  return start
}

/**
 * A name Protobase makes, such as an index's or a prefixed table's, as Postgres keeps it: the name itself within 63
 * bytes; past it, its start and `_` and the first 8 hex digits of its SHA-256, the same every time.
 */
export const generatedName = (name: string) => {
  if (bytes(name) <= maxIdentifierBytes) return name
  const hash = createHash('sha256').update(name).digest('hex').slice(0, 8)
  return `${startWithin(name, maxIdentifierBytes - hash.length - 1)}_${hash}`
}
