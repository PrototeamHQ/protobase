import { isUniqueSet, keyColumns, leadingIndex } from '../db/keys'
import { tableKey, type DbTable } from '../db/model'
import { checkEnumValues } from '../infer/check-values'
import { typesCompatible } from '../infer/compat'
import { columnDefault } from '../infer/defaults'
import { inferKind } from '../infer/type-map'
import type { ResourceModel } from '@protobase/schema'

export type Issue = {
  severity: 'error' | 'warning'
  resource: string
  message: string
  suggestion?: string
}

const quoteIdent = (name: string) => (/^[a-z_][a-z0-9_]*$/.test(name) ? name : `"${name.replaceAll('"', '""')}"`)

const sameValues = (a: string[] = [], b: string[] = []) => a.length === b.length && a.every((v) => b.includes(v))

const checkField = (model: ResourceModel, table: DbTable, name: string): Issue[] => {
  const field = model.fields[name]!
  const issues: Issue[] = []
  const error = (message: string, suggestion?: string): Issue => ({
    severity: 'error',
    resource: model.name,
    message: `${name}: ${message}`,
    ...(suggestion && { suggestion }),
  })
  const columns = field.relation?.columns ?? [field.column]
  for (const columnName of columns) {
    if (!table.columns.some((c) => c.name === columnName)) {
      issues.push(error(`column "${columnName}" does not exist in ${tableKey(table)}`))
    }
  }
  const column = table.columns.find((c) => c.name === columns[0])
  if (!column) return issues

  const kind = inferKind(column, checkEnumValues(table.checks, column.name))
  if (!typesCompatible(field.type, kind.type)) {
    issues.push(error(`declared ${field.type}, but ${column.name} is ${column.formatted}`))
  } else if (field.type === 'enum' && kind.type === 'enum' && !sameValues(field.enumValues, kind.enumValues)) {
    issues.push({
      severity: 'warning',
      resource: model.name,
      message: `${name}: enum values differ from the database (${kind.enumValues?.join(', ')})`,
    })
  }
  const declared = field.default && 'db' in field.default
  const fallback = columnDefault(column, kind).kind
  if (fallback === 'db' && !field.default) {
    issues.push({
      severity: 'warning',
      resource: model.name,
      message: `${name}: ${column.name} has a database default; add .dbDefault() (or .default(value))`,
    })
  }
  if (declared && fallback !== 'db') {
    issues.push({
      severity: 'warning',
      resource: model.name,
      message: `${name}: declared .dbDefault() but ${column.name} has no default the database computes`,
    })
  }
  if (field.filterable && !leadingIndex(table, column.name, model.tenant && model.fields[model.tenant]?.column)) {
    issues.push({
      severity: 'warning',
      resource: model.name,
      message: `${name}: filterable but ${column.name} has no index`,
      suggestion: `CREATE INDEX ON ${quoteIdent(table.schema)}.${quoteIdent(table.name)} (${quoteIdent(column.name)});`,
    })
  }
  return issues
}

const checkKey = (model: ResourceModel, table: DbTable): Issue[] => {
  if (!keyColumns(table)) {
    return [
      {
        severity: 'error',
        resource: model.name,
        message: `${tableKey(table)} has no primary key or unique NOT NULL index`,
        suggestion: `ALTER TABLE ${quoteIdent(table.schema)}.${quoteIdent(table.name)} ADD PRIMARY KEY (...);`,
      },
    ]
  }
  const columns = model.primaryKey.map((name) => model.fields[name]?.column)
  if (columns.some((c) => c === undefined) || isUniqueSet(table, columns as string[])) return []
  return [
    {
      severity: 'error',
      resource: model.name,
      message: `primary key (${columns.join(', ')}) is not backed by a unique index`,
    },
  ]
}

export const checkResource = (model: ResourceModel, tables: DbTable[]): Issue[] => {
  const schema = model.table.schema ?? 'public'
  const table = tables.find((t) => t.schema === schema && t.name === model.table.name)
  if (!table) {
    return [{ severity: 'error', resource: model.name, message: `table ${schema}.${model.table.name} does not exist` }]
  }
  return [...Object.keys(model.fields).flatMap((name) => checkField(model, table, name)), ...checkKey(model, table)]
}
