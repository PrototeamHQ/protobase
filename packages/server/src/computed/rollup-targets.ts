import type { FieldModel, ResourceModel } from '@protobase/schema'
import type { RollupTarget } from './rollup-sql'

const numberTypes = ['integer', 'bigint', 'decimal']

// What only every resource together tells of a rollup: that `from` has the relation and the field it names.
const targetProblems = (model: ResourceModel, field: FieldModel, from: ResourceModel | undefined) => {
  const { from: name, via, field: read } = field.rollup!
  if (!from) return [`rolls up "${name}", which is not a resource`]
  if (from.table.name === model.table.name && from.table.schema === model.table.schema) return [`rolls up "${name}", whose table is its own (not implemented)`]
  const relation = Object.hasOwn(from.fields, via) ? from.fields[via]! : undefined
  const value = read !== undefined && Object.hasOwn(from.fields, read) ? from.fields[read]! : undefined
  return [
    ...(model.primaryKey.length === 1 ? [] : ['is on a resource with a key of several columns (not implemented)']),
    ...(!relation ? [`is via "${via}", which is not a field of "${name}"`] : []),
    ...(relation && relation.relation?.resource !== model.name ? [`is via "${via}", which is no relation of "${name}" to "${model.name}"`] : []),
    ...(relation?.relation && relation.relation.columns.length !== 1 ? [`is via "${via}", a relation of several columns (not implemented)`] : []),
    ...(read !== undefined && !value ? [`reads "${read}", which is not a field of "${name}"`] : []),
    ...(value?.sensitive ? [`reads "${read}", which is sensitive`] : []),
    ...(value && field.rollup!.fn !== 'count' && !numberTypes.includes(value.type) ? [`reads "${read}", which is ${value.type}, not a number`] : []),
  ]
}

/**
 * Every rollup of the resources with its tables, as `tableSql` names a resource's; fails on a rollup whose resource,
 * relation or field is not there.
 */
export const rollupTargets = (models: readonly ResourceModel[], tableSql: (model: ResourceModel) => string): RollupTarget[] => {
  const byName = new Map(models.map((model) => [model.name, model]))
  return models.flatMap((model) =>
    Object.values(model.fields)
      .filter((field) => field.rollup)
      .map((field) => {
        const from = byName.get(field.rollup!.from)
        const problems = targetProblems(model, field, from)
        if (problems.length > 0) throw new Error(`Resource "${model.name}": ${problems.map((problem) => `rollup field "${field.name}" ${problem}`).join('; ')}`)
        return { model, field, from: from!, table: tableSql(model), fromTable: tableSql(from!) }
      }),
  )
}
