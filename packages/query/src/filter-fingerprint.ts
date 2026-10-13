import type { CheckedFilter } from '@protobase/schema'

/** The filter's structure without source spans, each field named by its column, so equal filters match however they were written. */
const canonical = (filter: CheckedFilter) =>
  JSON.stringify(filter, (key, value: unknown) => {
    if (key === 'span') return undefined
    if (key === 'field') return (value as { column: string }).column
    return value
  })

/** cyrb53, a fast 53-bit string hash; the fingerprint guards against mistakes, not forgery. */
const hash = (text: string) => {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ code, 2654435761)
    h2 = Math.imul(h2 ^ code, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

/** A short fingerprint of the filter a cursor was issued for; empty without a filter. */
export const filterFingerprint = (filter: CheckedFilter | undefined) => (filter ? hash(canonical(filter)) : '')
