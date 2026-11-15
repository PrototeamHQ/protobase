import { maxPerPage } from './list-blocks'
import type { LayoutNode } from './node'
import type { Draft } from './plan-draft'

// A list that says how many records match in all, such as "The first 10 of 37.", inside the records of another needs
// that total per record: one count beside its read, grouped by the field it splits on when the records around it are
// several, as a `Stat` there counts.

const totals = new Set(['Table', 'RecordCards'])

/**
 * The total of each record's rows that the read `own` of `node` splits, read beside it, `parents` the records around it
 * at most; none for a read that does not split.
 */
export const totalOf = (node: LayoutNode, own: Draft, parents: number): Draft | undefined => {
  if (!totals.has(node.type) || !own.split) return
  const { block, resource, filter, split } = own
  const base = { block, part: 'total', resource, ...(filter && { filter }), split, etag: false }
  if (!own.limitPer) return { ...base, kind: 'count', fields: new Set([split.field]) }
  return { ...base, kind: 'aggregate', groupBy: [own.limitPer.field], pageSize: Math.min(maxPerPage, parents), fields: undefined }
}
