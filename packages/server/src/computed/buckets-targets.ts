import type { FieldModel, ResourceModel } from '@protobase/schema'
import { measureFieldName } from '@protobase/schema/internal'
import type { BucketsTarget } from './buckets-sql'

/** Whether a resource is a time rollup. */
export const hasBuckets = (model: ResourceModel) => model.buckets !== undefined

/** The time rollups of the resources, with the resources they roll up. */
export const bucketModels = (models: readonly ResourceModel[]) =>
  models.flatMap((model) => {
    if (!model.buckets) return []
    const from = models.find((candidate) => candidate.name === model.buckets!.from)
    if (!from) throw new Error(`Resource "${model.name}" is a time rollup of "${model.buckets.from}", which is not a resource`)
    return [{ model, from }]
  })

// A field's type as its resource declares it, such as `decimal(10,2)`.
const declaredType = (field: FieldModel) => (field.decimal ? `${field.type}(${field.decimal.precision},${field.decimal.scale})` : field.type)

/** A time rollup with its tables, as `tableSql` names a resource's, and the source's columns it reads. */
export const bucketsTarget = (model: ResourceModel, from: ResourceModel, tableSql: (model: ResourceModel) => string): BucketsTarget => {
  const { time, every, by, measures } = model.buckets!
  const source = (field: string) => from.fields[field]!.column
  const read = [time, ...by, ...Object.keys(measures), ...(from.softDelete ? [from.softDelete] : [])]
  return {
    model,
    table: tableSql(model),
    fromTable: tableSql(from),
    every,
    time: source(time),
    by: by.map((field) => ({ column: model.fields[field]!.column, from: source(field) })),
    measures: Object.entries(measures).flatMap(([field, fns]) => fns.map((fn) => ({ fn, column: model.fields[measureFieldName(field, fn)]!.column, from: source(field) }))),
    counts: Object.keys(measures).map((field) => ({ column: model.fields[measureFieldName(field, 'count')]!.column, from: source(field) })),
    ...(from.softDelete && { softDelete: source(from.softDelete) }),
    types: [...new Set(read)].map((field) => `${source(field)} ${declaredType(from.fields[field]!)}`),
  }
}
