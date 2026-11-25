import { quoteIdent } from '../changes/capture-sql'
import type { ResourceReplaceable, SchemaModule, TableName } from '../schema-modules/schema-module'
import { bucketsFillSql, createBucketsSql, dropBucketsTableSql, type BucketsTarget } from './buckets-sql'
import { qualifiedTable, type FormulaInput, type RollupInput } from './computed-input'
import { columnType } from './column-sql'
import { addFormulaSql } from './formula-sql'
import { readComputed } from './read-computed'
import { addRollupColumnSql, backfillSql, dropRollupSql, rollupFunctionSql, rollupsSchema, rollupTriggerSql } from './rollup-sql'

const statements = (list: readonly string[]) => list.map((statement) => `${statement};`).join('\n')

// A rollup's or formula's column, dropped to be added again; any index on it goes with it.
const dropColumn = (table: TableName, column: string | undefined) =>
  `-- Any index on the column goes with it, and has to be created again.\nalter table ${qualifiedTable(table)} drop column ${quoteIdent(column!)};`

/** Each rollup's column, which its function keeps; its rows are empty until the rollup's values are set. */
const rollupColumns: ResourceReplaceable = {
  name: 'rollup_columns',
  title: "The column of a rollup field",
  version: 1,
  compatibleFrom: 1,
  sql: (_names, input) => statements([addRollupColumnSql(input as RollupInput)]),
  replace: (_names, table, column) => dropColumn(table, column),
  keptWhileOthers: false,
}

/** Each formula's generated column, marked with its expression. */
const formulas: ResourceReplaceable = {
  name: 'formulas',
  title: 'The generated column of a formula field',
  version: 1,
  compatibleFrom: 1,
  sql: (_names, input) => {
    const { table, model, field } = input as FormulaInput
    return statements(addFormulaSql(table, model, field))
  },
  replace: (_names, table, column) => dropColumn(table, column),
  keptWhileOthers: false,
}

// What a rollup's statements name of what it keeps, so its statements change with its column's type and the formula it reads.
const keeps = (target: RollupInput) =>
  `-- It keeps ${target.table}.${quoteIdent(target.field.column)}, ${columnType(target.field)}${target.readsFormula === undefined ? '' : `, from the formula ${target.readsFormula}`}.`

/**
 * The function and trigger that keep each rollup, made again by dropping the function, which takes its trigger with
 * it, and gone with the rollup; its values are set from the records once the transaction commits.
 */
const rollups: ResourceReplaceable = {
  name: 'rollups',
  title: 'The function and trigger that keep a rollup',
  version: 1,
  compatibleFrom: 1,
  sql: (_names, input) => {
    const target = input as RollupInput
    return `${keeps(target)}\n${statements([rollupFunctionSql(target), rollupTriggerSql(target)])}`
  },
  replace: (_names, table, column) => `${dropRollupSql(table, column!)};`,
  drop: (_names, table, column) => `${dropRollupSql(table, column!)};`,
  after: (_names, input) => statements([backfillSql(input as RollupInput)]),
  keptWhileOthers: false,
}

/**
 * Each time rollup's table, its indexes and refresh function, made again by dropping the table; filled once the
 * transaction commits.
 */
const timeRollups: ResourceReplaceable = {
  name: 'time_rollups',
  title: 'The table and refresh function of a time rollup',
  version: 1,
  compatibleFrom: 1,
  sql: (_names, input) => statements(createBucketsSql(input as BucketsTarget)),
  replace: (_names, table) => `${dropBucketsTableSql(qualifiedTable(table))};`,
  after: (_names, input) => statements([bucketsFillSql(input as BucketsTarget)]),
  keptWhileOthers: false,
}

/**
 * The rollup and formula fields' columns, the functions and triggers that keep the rollups, and the time rollups'
 * tables and refresh functions, per resource. A column, table or refresh function the config no longer has stays, for
 * a migration of the project's own to drop a deploy after the one that stops reading it; a rollup's function and
 * trigger go with it.
 */
export const computedModule: SchemaModule = {
  label: 'the rollups and formulas',
  title: "The columns of the resources' rollup and formula fields, the triggers that keep the rollups, and the tables and refresh functions of their time rollups",
  steps: [{ step: 1, name: 'rollups', title: 'The schema of the functions that keep rollups and refresh time rollups', additive: true, sql: () => `create schema if not exists ${quoteIdent(rollupsSchema)};` }],
  replaceables: [],
  // Rollup columns before formulas, which may read them, and the rollups' triggers after formulas, which they may read.
  resourceReplaceables: [rollupColumns, formulas, rollups, timeRollups],
  read: (db, input) => readComputed(db, input, [rollupColumns, formulas, rollups, timeRollups]),
}
