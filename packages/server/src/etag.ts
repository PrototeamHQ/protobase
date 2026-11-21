import { sha256Hex, stableJson } from './hash'
import type { Entry } from './registry'
import { etagAlias } from './sql-parts'
import type { Row } from './types'

/**
 * The version of a row. With a version or `updated_at` column it is a hash of that column's exact text (so a hidden column's
 * value is never shown, yet every change moves it); without one it is a hash of the exposed fields, which are only the
 * fields the caller may read, so a change to a hidden field cannot be detected. Lookup fields are left out: they are
 * the linked records', which a write of this one neither reads nor changes.
 */
export const etagOf = async (entry: Entry, raw: Row, exposed: Row) => {
  const hash = async (text: string) => (await sha256Hex(text)).slice(0, 32)
  if (entry.etag) return `"${entry.etag.kind === 'version' ? 'v' : 't'}${await hash(String(raw[etagAlias]))}"`
  const own = Object.fromEntries(Object.entries(exposed).filter(([name]) => !Object.hasOwn(entry.model.lookups ?? {}, name)))
  return `"h${await hash(stableJson(own))}"`
}

const tags = (header: string) => header.split(',').map((tag) => tag.trim().replace(/^W\//, ''))

/** If-Match comparison: `*` or any listed tag equal to the current one. */
export const ifMatchSatisfied = (header: string, etag: string) => {
  const listed = tags(header)
  return listed.includes('*') || listed.includes(etag)
}

export const ifNoneMatchSatisfied = (header: string, etag: string) => ifMatchSatisfied(header, etag)
