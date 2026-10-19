import type { FieldModel, ResourceModel } from '../model'
import { formulaFields, formulaNullable, parseFormula } from './formula'

const numberTypes = ['integer', 'bigint', 'decimal']

// What the field may not also be, since the database writes it: anything else that writes it, or a value it is known by.
const writtenProblems = (model: ResourceModel, field: FieldModel) => [
  ...(field.sensitive ? ['cannot be sensitive'] : []),
  ...(field.ai ? ['cannot be an AI field'] : []),
  ...(field.file ? ['cannot be a file'] : []),
  ...(field.default ? ['cannot have a default, as the database computes it'] : []),
  ...([...model.primaryKey, model.tenant, model.owner, model.softDelete].includes(field.name) ? ['cannot be a key, tenant, owner or soft delete field'] : []),
]

// A rollup is a number column; the other resource and its fields are checked once every resource is known.
const rollupProblems = (model: ResourceModel, field: FieldModel) => {
  const { fn } = field.rollup!
  return [
    ...(field.formula !== undefined ? ['cannot be a formula too'] : []),
    ...(numberTypes.includes(field.type) ? [] : [`is ${field.type}, not an integer, bigint or decimal`]),
    ...(fn === 'count' && field.type === 'decimal' ? ['counts, so it is an integer or bigint'] : []),
    ...(fn === 'avg' && field.type !== 'decimal' ? ['takes an average, so it is a decimal'] : []),
    ...((fn === 'avg' || fn === 'min' || fn === 'max') && !field.nullable ? [`must be optional(), as its ${fn} is empty without records`] : []),
    ...writtenProblems(model, field),
  ].map((problem) => `rollup field "${field.name}" ${problem}`)
}

// A formula is a generated column, which Postgres lets read only the row's plain columns.
const formulaProblems = (model: ResourceModel, field: FieldModel) => {
  const node = parseFormula(field.formula!)
  const read = (name: string) => (Object.hasOwn(model.fields, name) ? model.fields[name]! : undefined)
  return [
    ...(numberTypes.includes(field.type) ? [] : [`is ${field.type}, not an integer, bigint or decimal`]),
    ...formulaFields(node).flatMap((name) => {
      const other = read(name)
      if (!other) return [`reads "${name}", which is not a field`]
      if (name === field.name) return [`reads "${name}", itself`]
      if (other.formula !== undefined) return [`reads "${name}", which is a formula too`]
      if (other.sensitive) return [`reads "${name}", which is sensitive`]
      return numberTypes.includes(other.type) ? [] : [`reads "${name}", which is ${other.type}, not a number`]
    }),
    ...(!field.nullable && formulaNullable(node, (name) => read(name)?.nullable ?? false) ? ['must be optional(), or coalesce() the optional fields it reads'] : []),
    ...writtenProblems(model, field),
  ].map((problem) => `formula field "${field.name}" ${problem}`)
}

/** What is wrong with a resource's rollup and formula fields, as far as the resource alone tells. */
export const computedProblems = (model: ResourceModel) =>
  Object.values(model.fields).flatMap((field) => [
    ...(field.rollup ? rollupProblems(model, field) : []),
    ...(field.formula !== undefined ? formulaProblems(model, field) : []),
  ])
