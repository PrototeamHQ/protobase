import { Field, type AnyField, type FieldMeta } from '../field'
import { f } from '../fields'
import type { FieldModel, ResourceModel } from '../model'
import type { FieldsInput } from '../refs'
import type { BucketMeasure, BucketsModel } from './buckets-model'

/** A time rollup's source as `.bucketsOf()` reads it: its model, and its fields as declared, which the rollup copies. */
export type BucketsSource = { model: ResourceModel; fields: FieldsInput }

const everies = ['hour', 'day']
const measures: readonly BucketMeasure[] = ['sum', 'max']
const numberTypes = ['integer', 'bigint', 'decimal']
const groupTypes = ['text', 'integer', 'bigint', 'decimal', 'boolean', 'date', 'uuid', 'enum', 'relation', 'currency', 'country']
// The rollup's own fields besides the groups and measures.
const ownNames = ['id', 'bucket', 'events']
const lateShape = /^\d+ (minute|hour|day)s?$/

// A sum keeps ten digits more than its field, room for ten billion records of the greatest value.
const sumDigits = 10

// A copy of a source field the database writes: its type and values, read-only, without the source's column, default
// or rules.
const copied = (field: AnyField, patch: Partial<FieldMeta>) => {
  const { type, enumValues, relation, precision, scale } = field.meta
  return new Field(field.def, {
    type,
    nullable: false,
    readOnly: true,
    filterable: false,
    sortable: false,
    aliases: [],
    hasDefault: false,
    ...(enumValues && { enumValues: [...enumValues] }),
    ...(relation && { relation: { resource: relation.resource } }),
    ...(precision !== undefined && { precision, scale: scale! }),
    ...patch,
  })
}

const sumField = (field: FieldModel, declared: AnyField) => {
  if (field.type === 'integer') return f.bigint().readOnly().optional()
  if (field.type === 'bigint') return f.decimal({ precision: 19 + sumDigits, scale: 0 }).readOnly().optional()
  return f.decimal({ precision: Math.min(declared.meta.precision! + sumDigits, 1000), scale: declared.meta.scale! }).readOnly().optional()
}

/** The names of the measure fields of a time rollup, by source field and measure. */
export const measureFieldName = (field: string, measure: BucketMeasure) => `${field}_${measure}`

const timeProblems = (source: ResourceModel, time: string) => {
  const field = source.fields[time]
  if (!field) return [`time "${time}" is not a field of "${source.name}"`]
  return field.type === 'timestamp' ? [] : [`time "${time}" is ${field.type}, not a timestamp`]
}

const byProblems = (source: ResourceModel, by: readonly string[]) =>
  by.flatMap((name, index) => {
    const field = source.fields[name]
    if (!field) return [`groups by "${name}", which is not a field of "${source.name}"`]
    return [
      ...(by.indexOf(name) !== index ? [`groups by "${name}" twice`] : []),
      ...(ownNames.includes(name) ? [`groups by "${name}", a name the rollup keeps for its own field`] : []),
      ...(groupTypes.includes(field.type) ? [] : [`groups by "${name}", which is ${field.type}`]),
      ...(field.relation && field.relation.columns.length !== 1 ? [`groups by "${name}", a relation of several columns (not implemented)`] : []),
      ...(field.nullable ? [`groups by "${name}", which is optional; a bucket's key has no empty part`] : []),
      ...(field.sensitive ? [`groups by "${name}", which is sensitive`] : []),
    ]
  })

const measureProblems = (source: ResourceModel, kept: Record<string, readonly BucketMeasure[]>, by: readonly string[]) =>
  Object.entries(kept).flatMap(([name, fns]) => {
    const field = source.fields[name]
    if (!field) return [`measures "${name}", which is not a field of "${source.name}"`]
    return [
      ...(numberTypes.includes(field.type) ? [] : [`measures "${name}", which is ${field.type}, not an integer, bigint or decimal`]),
      ...(field.sensitive ? [`measures "${name}", which is sensitive`] : []),
      ...(fns.length === 0 ? [`measures "${name}" with nothing; give sum, max or both`] : []),
      ...fns.flatMap((fn, index) => [
        ...(measures.includes(fn) ? [] : [`measures "${name}" with "${String(fn)}", not sum or max`]),
        ...(fns.indexOf(fn) !== index ? [`measures "${name}" with ${fn} twice`] : []),
        ...(by.includes(measureFieldName(name, fn)) ? [`measures "${name}" with ${fn}, whose field "${measureFieldName(name, fn)}" it groups by`] : []),
      ]),
    ]
  })

/**
 * What `.bucketsOf()` sets on a resource: its fields, its key `id`, the tenant and owner from the source's, and the rollup. Throws on
 * a rollup the source cannot give: a time field that is not a timestamp, a group the bucket's key cannot hold, a
 * measure that is no number, or a tenant-scoped source whose tenant field is not one of the groups.
 */
export const bucketsState = (name: string, source: BucketsSource, buckets: BucketsModel) => {
  const { model } = source
  const problems = [
    ...(model.buckets ? [`rolls up "${model.name}", which is a time rollup itself`] : []),
    ...((model.parents ?? []).some((parent) => parent.access === 'read') ? [`rolls up "${model.name}", whose reads keep to records whose parent the caller reads (not implemented)`] : []),
    ...(everies.includes(buckets.every) ? [] : [`every "${String(buckets.every)}" is not hour or day`]),
    ...timeProblems(model, buckets.time),
    ...byProblems(model, buckets.by),
    ...(model.tenant && !buckets.by.includes(model.tenant) ? [`does not group by "${model.tenant}", the tenant field of "${model.name}"`] : []),
    ...measureProblems(model, buckets.measures, buckets.by),
    ...(lateShape.test(buckets.late) ? [] : [`late "${buckets.late}" is not a number of minutes, hours or days, such as "2 hours"`]),
  ]
  if (problems.length > 0) throw new Error(`Resource "${name}": the time rollup ${problems.join('; ')}`)
  const declared = (field: string) => source.fields[field]!
  const fields: FieldsInput = {
    id: f.bigint().readOnly().filterable().sortable(),
    bucket: f.timestamp().readOnly().filterable().sortable(),
    ...Object.fromEntries(buckets.by.map((field) => [field, copied(declared(field), { filterable: true, sortable: true })])),
    events: f.bigint().readOnly(),
    ...Object.fromEntries(
      Object.entries(buckets.measures).flatMap(([field, fns]) =>
        fns.map((fn) => [measureFieldName(field, fn), fn === 'sum' ? sumField(model.fields[field]!, declared(field)) : copied(declared(field), { nullable: true })]),
      ),
    ),
  }
  return {
    fields,
    primaryKey: ['id'],
    ...(model.tenant && { tenant: model.tenant, ...(model.tenantAcross && { tenantAcross: model.tenantAcross }) }),
    ...(model.owner && buckets.by.includes(model.owner) && { owner: model.owner }),
    buckets: { ...buckets, by: [...buckets.by], measures: Object.fromEntries(Object.entries(buckets.measures).map(([field, fns]) => [field, [...fns]])) },
  }
}
