import type { FieldModel, ResourceModel } from '@protobase/schema'
import { parseFormula, type FormulaNode } from '@protobase/schema/internal'
import { quoteIdent } from '../changes/capture-sql'
import { columnType } from './column-sql'

// Every value is a numeric, so `7 / 2` is 3.5 whatever the column types; the column's type rounds the result.
const expressionSql = (node: FormulaNode, model: ResourceModel): string => {
  if (node.kind === 'number') return `${node.value}::numeric`
  if (node.kind === 'field') return `${quoteIdent(model.fields[node.name]!.column)}::numeric`
  if (node.kind === 'negate') return `(- ${expressionSql(node.operand, model)})`
  if (node.kind === 'binary') return `(${expressionSql(node.left, model)} ${node.op} ${expressionSql(node.right, model)})`
  if (node.kind === 'coalesce') return `coalesce(${node.args.map((arg) => expressionSql(arg, model)).join(', ')})`
  return `round(${expressionSql(node.value, model)}${node.digits === undefined ? '' : `, ${node.digits}`})`
}

/** A formula field's generation expression, cast to its column's type. */
export const formulaSql = (model: ResourceModel, field: FieldModel) => `(${expressionSql(parseFormula(field.formula!), model)})::${columnType(field)}`

/** The comment that marks a formula's column as Protobase's, with the expression it was generated from. */
export const formulaComment = (model: ResourceModel, field: FieldModel) => `protobase formula: ${formulaSql(model, field)}`

/** Whether a column's comment marks it as a formula's column. */
export const isFormulaComment = (comment: string | null) => comment?.startsWith('protobase formula: ') ?? false

/** The statements that add a formula's generated column to `table` and mark it. */
export const addFormulaSql = (table: string, model: ResourceModel, field: FieldModel) => [
  `alter table ${table} add column ${quoteIdent(field.column)} ${columnType(field)} generated always as (${formulaSql(model, field)}) stored`,
  `comment on column ${table}.${quoteIdent(field.column)} is '${formulaComment(model, field).replaceAll("'", "''")}'`,
]
