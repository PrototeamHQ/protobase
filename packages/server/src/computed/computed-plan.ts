import type { FieldModel, ResourceModel } from '@protobase/schema'
import { quoteIdent } from '../changes/capture-sql'
import { columnType } from './column-sql'
import { addFormulaSql, formulaComment, isFormulaComment } from './formula-sql'
import { addRollupColumnSql, backfillSql, dropRollupFunctionSql, dropRollupTriggerSql, rollupBody, rollupFunctionName, rollupFunctionSql, rollupsSchema, rollupTriggerName, rollupTriggerSql, type RollupTarget } from './rollup-sql'
import { rollupTargets } from './rollup-targets'

/** A column of a resource's table: its table's oid, its type as `format_type` names it, and its comment. */
export type FoundColumn = { table: string; name: string; type: string; generated: boolean; comment: string | null }

/** A function of the rollups schema. */
export type FoundFunction = { oid: string; name: string; source: string; definer: boolean }

/** A trigger calling a function of the rollups schema, or on a table that a rollup reads. */
export type FoundTrigger = { table: string; tableSql: string; name: string; function: string }

/** What the database has of the rollup and formula columns. */
export type ComputedState = {
  /** Each resource's table: its oid and its name as the catalogue qualifies it; `null` when it does not exist. */
  tables: Record<string, { oid: string; sql: string } | null>
  /** The columns of the rollup and formula fields that exist. */
  columns: FoundColumn[]
  functions: FoundFunction[]
  triggers: FoundTrigger[]
}

/** What brings the database to the config: the statements, and the fields they bring up to date. */
export type ComputedPlan = { statements: string[]; behind: string[] }

/** Whether a resource has rollup or formula fields. */
export const hasComputed = (model: ResourceModel) => Object.values(model.fields).some((field) => field.rollup || field.formula !== undefined)

const fieldName = (model: ResourceModel, field: FieldModel) => `${model.name}.${field.name}`

const formulaStatements = (model: ResourceModel, field: FieldModel, table: string, found: FoundColumn | undefined) => {
  const name = `${table}.${quoteIdent(field.column)}`
  if (!found) return addFormulaSql(table, model, field)
  if (!found.generated) throw new Error(`Column ${name} of formula field "${fieldName(model, field)}" is a plain column; drop or rename it in a migration, then write the formula's with \`protobase migration\``)
  if (!isFormulaComment(found.comment)) throw new Error(`Column ${name} of formula field "${fieldName(model, field)}" is a generated column of the project's own; drop it in a migration, or remove .formula()`)
  if (found.comment === formulaComment(model, field) && found.type === columnType(field)) return []
  return [
    `-- The formula of "${fieldName(model, field)}" changed: its column is generated again, and an index on it has to be created again\nalter table ${table} drop column ${quoteIdent(field.column)}`,
    ...addFormulaSql(table, model, field),
  ]
}

const rollupColumnStatements = (target: RollupTarget, found: FoundColumn | undefined) => {
  const name = `${target.table}.${quoteIdent(target.field.column)}`
  if (!found) return [addRollupColumnSql(target)]
  if (found.generated) throw new Error(`Column ${name} of rollup field "${fieldName(target.model, target.field)}" is a generated column; drop it in a migration, then write the rollup's with \`protobase migration\``)
  if (found.type !== columnType(target.field)) throw new Error(`Column ${name} of rollup field "${fieldName(target.model, target.field)}" is ${found.type}, not ${columnType(target.field)} as the field declares; change one of them`)
  return []
}

/**
 * Compares the database with the resources' rollup and formula fields. Fails on what it cannot change safely: a
 * missing table, a column of the project's own where one is declared, or a trigger of the same name that calls another
 * function. A changed formula's column is dropped and added again; a rollup's function, trigger and values are written
 * again when its column is new or its definition changed. Columns are never dropped otherwise.
 */
export const computedPlan = (models: readonly ResourceModel[], state: ComputedState): ComputedPlan => {
  const table = (model: ResourceModel) => {
    const found = state.tables[model.name]
    if (!found) throw new Error(`The table of resource "${model.name}" does not exist`)
    return found
  }
  const column = (model: ResourceModel, field: FieldModel) => state.columns.find((found) => found.table === table(model).oid && found.name === field.column)
  const behind: string[] = []
  const formulas: string[] = []
  const regenerated = new Set<string>()
  for (const model of models) {
    for (const field of Object.values(model.fields).filter((candidate) => candidate.formula !== undefined)) {
      const sql = formulaStatements(model, field, table(model).sql, column(model, field))
      if (sql.length === 0) continue
      behind.push(fieldName(model, field))
      if (column(model, field)) regenerated.add(fieldName(model, field))
      formulas.push(...sql)
    }
  }
  // A rollup's trigger names the columns it reads, so one that reads a formula generated again is dropped before it and
  // created again after it.
  const readsRegenerated = ({ from, field }: RollupTarget) => field.rollup!.field !== undefined && regenerated.has(`${from.name}.${field.rollup!.field}`)
  const targets = rollupTargets(models, (model) => table(model).sql)
  const rollupColumns: string[] = []
  const droppedTriggers: string[] = []
  const rollups: string[] = []
  for (const target of targets) {
    const columnSql = rollupColumnStatements(target, column(target.model, target.field))
    const fn = state.functions.find((found) => found.name === rollupFunctionName(target))
    const fromOid = table(target.from).oid
    const own = state.triggers.find((found) => found.table === fromOid && found.name === rollupTriggerName(target))
    if (own && !state.functions.some((found) => found.oid === own.function)) throw new Error(`Table ${target.fromTable} has a trigger "${own.name}" of its own; rename it, since rollup field "${fieldName(target.model, target.field)}" needs that name`)
    const stale = fn ? state.triggers.filter((found) => found.function === fn.oid && (found.table !== fromOid || found.name !== rollupTriggerName(target))) : []
    const current = columnSql.length === 0 && fn !== undefined && fn.definer && fn.source === rollupBody(target) && own?.function === fn.oid && stale.length === 0 && !readsRegenerated(target)
    if (current) continue
    behind.push(fieldName(target.model, target.field))
    rollupColumns.push(...columnSql)
    droppedTriggers.push(...stale.map((found) => dropRollupTriggerSql(found.name, found.tableSql)), dropRollupTriggerSql(rollupTriggerName(target), target.fromTable))
    rollups.push(rollupFunctionSql(target), rollupTriggerSql(target), backfillSql(target))
  }
  const wanted = targets.map(rollupFunctionName)
  const dropped = state.functions.filter((found) => !wanted.includes(found.name)).map((found) => dropRollupFunctionSql(found.name))
  // Rollup columns come before formulas, so a formula may read a rollup, and rollups after them, so a rollup may read a formula.
  const statements = [
    ...(rollups.length > 0 ? [`create schema if not exists ${quoteIdent(rollupsSchema)}`] : []),
    ...dropped,
    ...droppedTriggers,
    ...rollupColumns,
    ...formulas,
    ...rollups,
  ]
  return { statements, behind }
}
