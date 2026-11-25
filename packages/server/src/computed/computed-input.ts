import type { FieldModel, ResourceModel } from '@protobase/schema'
import { quoteIdent } from '../changes/capture-sql'
import type { ModuleInput, ResourceInput, TableName } from '../schema-modules/schema-module'
import { bucketModels, bucketsTarget, hasBuckets } from './buckets-targets'
import type { RollupTarget } from './rollup-sql'
import { rollupTargets } from './rollup-targets'

/** Whether a resource has rollup or formula fields. */
export const hasComputed = (model: ResourceModel) => Object.values(model.fields).some((field) => field.rollup || field.formula !== undefined)

/** Whether the computed module serves a resource: it has rollups or formulas, or is a time rollup. */
export const computedOn = (model: ResourceModel) => hasComputed(model) || hasBuckets(model)

/** A table as SQL names it to Protobase's own functions: qualified, in `public` when the resource names no schema. */
export const qualifiedTable = (table: TableName) => `${quoteIdent(table.schema ?? 'public')}.${quoteIdent(table.name)}`

const tableOf = ({ table }: ResourceModel): TableName => ({ ...(table.schema !== undefined && { schema: table.schema }), name: table.name })

const modelTable = (model: ResourceModel) => qualifiedTable(model.table)

/** A formula field with the table its column is on. */
export type FormulaInput = { table: string; model: ResourceModel; field: FieldModel }

/** A rollup with the formula of the field it reads, when it reads one, whose column its trigger names. */
export type RollupInput = RollupTarget & { readsFormula?: string }

const fieldKey = (model: ResourceModel, field: FieldModel) => `${model.name}.${field.name}`

const columnInput = (model: ResourceModel, field: FieldModel, input: unknown): ResourceInput => ({ table: tableOf(model), column: field.column, input })

/**
 * What the computed module takes from the app's resources, by resource replaceable: each rollup's column and the
 * function and trigger that keep it, each formula's column, and each time rollup's table and refresh function. A table
 * the resource names without a schema is in `public`. Refuses a rollup whose resource, relation or field is not there.
 */
export const computedInput = (models: readonly ResourceModel[]): ModuleInput => {
  const rollups = rollupTargets(models, modelTable)
  const formulas = models.flatMap((model) => Object.values(model.fields).filter((field) => field.formula !== undefined).map((field) => ({ model, field })))
  const readFormula = ({ from, field }: RollupTarget) => (field.rollup!.field === undefined ? undefined : from.fields[field.rollup!.field]!.formula)
  return {
    names: {},
    resources: {
      rollup_columns: Object.fromEntries(rollups.map((target) => [fieldKey(target.model, target.field), columnInput(target.model, target.field, target)])),
      formulas: Object.fromEntries(formulas.map(({ model, field }) => [fieldKey(model, field), columnInput(model, field, { table: modelTable(model), model, field } satisfies FormulaInput)])),
      rollups: Object.fromEntries(
        rollups.map((target) => {
          const formula = readFormula(target)
          return [fieldKey(target.model, target.field), columnInput(target.model, target.field, { ...target, ...(formula !== undefined && { readsFormula: formula }) } satisfies RollupInput)]
        }),
      ),
      time_rollups: Object.fromEntries(bucketModels(models).map(({ model, from }) => [model.name, { table: tableOf(model), input: bucketsTarget(model, from, modelTable) }])),
    },
  }
}
