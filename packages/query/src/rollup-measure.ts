import { sql, type RawBuilder } from 'kysely'
import type { BucketsModel, ResourceModel } from '@protobase/schema'
import { keptMeasure, measureFieldName } from '@protobase/schema/internal'
import { columnRef, findField } from './columns'
import { QueryError } from './errors'

const refused = (message: string) => new QueryError('invalid_option', message)

/**
 * A measure over a time rollup's stored columns, so it gives what the same measure over the source's records gives:
 * a sum adds up `<field>_sum` (or `events` or `<field>_count`, the counts), an average divides that sum by the records with
 * a value, and a maximum takes the greatest `<field>_max`. Throws on what the buckets cannot give, such as an average of
 * greatest values.
 */
export const rollupMeasureSql = (model: ResourceModel, buckets: BucketsModel, measure: { kind: 'sum' | 'average' | 'maximum'; field: string }, column: RawBuilder<unknown>) => {
  if (measure.field === 'events') {
    if (measure.kind === 'sum') return sql`sum(${column})`
    throw refused(`"events" counts each bucket's records, so a time rollup gives only their sum, the count`)
  }
  const kept = keptMeasure(buckets, measure.field)
  if (!kept) throw refused(`"${measure.field}" is no measure of the time rollup "${model.name}": give events, or a <field>_sum, <field>_max or <field>_count field`)
  if (kept.measure === 'count') {
    if (measure.kind === 'sum') return sql`sum(${column})`
    throw refused(`"${measure.field}" counts each bucket's records with a value, so a time rollup gives only their sum, the count`)
  }
  if (kept.measure === 'max') {
    if (measure.kind === 'maximum') return sql`max(${column})`
    throw refused(`"${measure.field}" keeps each bucket's greatest value, so a time rollup gives only its maximum`)
  }
  if (measure.kind === 'sum') return sql`sum(${column})`
  if (measure.kind === 'maximum') throw refused(`"${measure.field}" keeps each bucket's sum, so a time rollup gives its sum or average, not a maximum`)
  // A group whose records all lack a value counts 0 of them, and its average is NULL, as `avg()` over the records gives
  const counted = columnRef(findField(model, measureFieldName(kept.field, 'count')))
  return sql`(sum(${column}) / nullif(sum(${counted}), 0))`
}

/** How many records a group holds: its rows, or for a time rollup the records its buckets count. */
export const countSql = (model: ResourceModel) =>
  model.buckets ? sql`sum(${columnRef(findField(model, 'events'))})` : sql`count(*)`
