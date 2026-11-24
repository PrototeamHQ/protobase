import { AliasNode, ColumnNode, DefaultInsertValueNode, IdentifierNode, ReferenceNode, SelectAllNode, InsertQueryNode, PrimitiveValueListNode, SelectionNode, SelectQueryNode, ValueListNode, ValueNode, TableNode, ValuesNode, type ColumnUpdateNode, type OnConflictNode, type OperationNode } from 'kysely'
import { andWhere, holdsScope, isOrganization, literalOf, ScopeRefused, scopeCondition, type Organization } from './scope-condition'
import type { ScopedTable } from './scoped-tables'

const tableName = (table: TableNode) => [table.table.schema?.name, table.table.identifier.name].filter(Boolean).join('.')

// The column an update sets: `set({ col })` names a column, `set('col', value)` a reference to one.
const updatedColumn = (column: OperationNode) => {
  if (ColumnNode.is(column)) return column.column.name
  if (ReferenceNode.is(column) && ColumnNode.is(column.column)) return column.column.column.name
  return
}

/** Refuses a write of the organization column with anything but the organization itself, as a literal. */
export const checkColumnUpdates = (updates: readonly ColumnUpdateNode[] | undefined, scoped: ScopedTable, organization: Organization, table: TableNode) => {
  for (const update of updates ?? []) {
    const column = updatedColumn(update.column)
    if (column === undefined) throw new ScopeRefused(`An update of ${tableName(table)} sets a column it cannot name: set each column by its name`)
    if (column !== scoped.column) continue
    const written = literalOf(update.value)
    if (written && isOrganization(written.value, organization)) continue
    throw new ScopeRefused(`An update sets ${tableName(table)}.${scoped.column} to another organization than the one it works in`)
  }
}

// Each row's values, with the organization added at the end, or checked where the row names it. A row of a batch that
// leaves the column out, where another names it, holds `DEFAULT` there: it gets the organization.
const scopeValues = (values: ValuesNode, at: number, organization: Organization, refuse: () => never) =>
  ValuesNode.create(
    values.values.map((row) => {
      if (PrimitiveValueListNode.is(row)) {
        if (at < 0) return PrimitiveValueListNode.create([...row.values, organization])
        if (!isOrganization(row.values[at], organization)) refuse()
        return row
      }
      if (!ValueListNode.is(row)) throw new Error('Not implemented: an insert row that is no list of values')
      if (at < 0) return ValueListNode.create([...row.values, ValueNode.create(organization)])
      if (DefaultInsertValueNode.is(row.values[at]!)) return ValueListNode.create(row.values.map((value, i) => (i === at ? ValueNode.create(organization) : value)))
      const written = literalOf(row.values[at]!)
      if (!written || !isOrganization(written.value, organization)) refuse()
      return row
    }),
  )

// The select's column that the scope wrote, as a query it transformed already shows it: the last column, where the
// select names each column on its own, so its place in the list is its place in the insert's columns.
const writesOrganization = (select: SelectQueryNode, at: number, scoped: ScopedTable, organization: Organization) => {
  const selections = select.selections ?? []
  if (at !== selections.length - 1 || selections.some(({ selection }) => SelectAllNode.is(selection) || (ReferenceNode.is(selection) && SelectAllNode.is(selection.column)))) return false
  const written = selections[at]?.selection
  if (!written || !AliasNode.is(written) || !IdentifierNode.is(written.alias) || written.alias.name !== scoped.column) return false
  const value = literalOf(written.node)
  return value !== undefined && isOrganization(value.value, organization)
}

// `insert … select`: the organization as the select's last column, under the column's name.
const scopeSelect = (select: SelectQueryNode, at: number, scoped: ScopedTable, organization: Organization, table: TableNode): SelectQueryNode => {
  if (select.setOperations?.length) throw new Error('Not implemented: insert … select of a union into a scoped table')
  if (at >= 0 && writesOrganization(select, at, scoped, organization)) return select
  if (at >= 0) throw new ScopeRefused(`An insert into ${tableName(table)} selects its ${scoped.column}: leave the column out, the scope writes the organization`)
  if (!select.selections?.length) throw new Error('Not implemented: insert … select without a column list into a scoped table')
  const column = SelectionNode.create(AliasNode.create(ValueNode.create(organization), IdentifierNode.create(scoped.column)))
  return { ...select, selections: [...select.selections, column] }
}

/**
 * An insert into a scoped table, in the organization: every row gets its organization, a row naming another one is
 * refused, and an upsert updates a row of the organization only. Without an organization, it is refused.
 */
export const scopeInsert = (node: InsertQueryNode, scoped: ScopedTable, organization: Organization, table: TableNode): InsertQueryNode => {
  if (organization === undefined) throw new ScopeRefused(`An insert into ${tableName(table)} works in no organization`)
  const refuse = (): never => {
    throw new ScopeRefused(`An insert into ${tableName(table)} names another organization than the one it works in`)
  }
  const columns = node.columns
  if (node.values !== undefined && columns === undefined) throw new Error(`Not implemented: an insert into ${tableName(table)} without its column list`)
  const at = (columns ?? []).findIndex((column) => column.column.name === scoped.column)
  const own = at < 0 ? [...(columns ?? []), ColumnNode.create(scoped.column)] : columns!
  const values = (): OperationNode => {
    if (node.values === undefined) return ValuesNode.create([ValueListNode.create([ValueNode.create(organization)])])
    if (ValuesNode.is(node.values)) return scopeValues(node.values, at, organization, refuse)
    if (SelectQueryNode.is(node.values)) return scopeSelect(node.values, at, scoped, organization, table)
    throw new Error(`Not implemented: an insert into ${tableName(table)} of values that are neither rows nor a select`)
  }
  const onConflict = node.onConflict && scopeConflict(node.onConflict, scoped, organization, table)
  return InsertQueryNode.cloneWith(node, { columns: own, values: values(), defaultValues: false, ...(onConflict && { onConflict }) })
}

// An upsert's update touches the conflicting row only when it is of the organization: one of another, found by a key
// unique across the app, stays as it is.
const scopeConflict = (node: OnConflictNode, scoped: ScopedTable, organization: Organization, table: TableNode) => {
  if (node.doNothing) return node
  checkColumnUpdates(node.updates, scoped, organization, table)
  // The conflicting row goes by the table's name there, without its schema.
  const row = TableNode.create(table.table.identifier.name)
  if (holdsScope(node.updateWhere?.where, scoped, row, organization)) return node
  return { ...node, updateWhere: andWhere(node.updateWhere, scopeCondition(scoped, row, organization)) }
}
