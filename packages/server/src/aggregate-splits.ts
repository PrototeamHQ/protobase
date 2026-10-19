import { series, splitSeries, type Measure, type SeriesOptions } from '@protobase/query'
import type { ResourceModel } from '@protobase/schema'
import type { Deps } from './deps'
import { labelRequests, relatedLabels } from './related-labels'
import { readTransaction } from './transactions'
import type { Session } from './types'

type SplitOptions = SeriesOptions & { measure?: Measure }

/**
 * The buckets of a date field with each split into its parts: per bucket the shown values that have rows in it, in
 * rank order. The bucket's own totals stay what `series` finds, so what the other values add up to is total minus parts.
 * With `label`, a relation's values carry the `label` field of the record each points at.
 */
export const splitGroups = async (
  deps: Deps,
  session: Session,
  model: ResourceModel,
  field: string,
  split: { by: string; limit?: number; label?: string },
  options: SplitOptions,
) => {
  const labels = split.label === undefined ? [] : await labelRequests(deps, session, model, [split.by], `${split.by}.${split.label}`)
  return readTransaction(deps.db, deps.statementTimeoutMs, async (trx) => {
    const buckets = await series(trx, model, field, options)
    const { splits, points } = await splitSeries(trx, model, field, split.by, { ...options, ...(split.limit !== undefined && { limit: split.limit }) })
    const names = (await relatedLabels(trx, labels, splits.map((value) => ({ [split.by]: value }))))[split.by] ?? {}
    const partsOf = new Map<string, Array<Record<string, unknown>>>()
    for (const { bucket, split: value, ...totals } of points) {
      partsOf.set(bucket, [...(partsOf.get(bucket) ?? []), { value, ...totals }])
    }
    return {
      splits: splits.map((value) => {
        const label = value === null ? undefined : names[String(value)]
        return label === undefined ? { value } : { value, label }
      }),
      groups: buckets.map(({ bucket, ...totals }) => ({ value: bucket, ...totals, splits: partsOf.get(bucket) ?? [] })),
    }
  })
}
