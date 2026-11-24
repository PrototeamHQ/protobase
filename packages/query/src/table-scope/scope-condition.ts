import { AndNode, BinaryOperationNode, ColumnNode, OnNode, OperatorNode, OrNode, ParensNode, RawNode, ReferenceNode, ValueNode, WhereNode, type OperationNode, type TableNode } from 'kysely'
import type { ScopedTable } from './scoped-tables'

/** The organization a query works in; undefined when it works in none, which sees no scoped row and writes none. */
export type Organization = string | number | undefined

/** Thrown for a query the scope cannot keep to its organization, before it reaches the database. */
export class ScopeRefused extends Error {
  override name = 'ScopeRefused'
}

/** `<qualifier>.<column> = <organization>`, or `false` without an organization. */
export const scopeCondition = (scoped: ScopedTable, qualifier: TableNode, organization: Organization): OperationNode =>
  organization === undefined
    ? RawNode.createWithSql('false')
    : BinaryOperationNode.create(ReferenceNode.create(ColumnNode.create(scoped.column), qualifier), OperatorNode.create('='), ValueNode.create(organization))

const sameTable = (a: TableNode, b: TableNode) => a.table.identifier.name === b.table.identifier.name && a.table.schema?.name === b.table.schema?.name

// The terms a condition ands together. Kysely prints an `and` without parentheses, so one with a bare `or` on either
// side reads as `a or b and c` and constrains nothing as a whole: it counts as one opaque term.
const conjuncts = (node: OperationNode): OperationNode[] => {
  if (AndNode.is(node)) return OrNode.is(node.left) || OrNode.is(node.right) ? [node] : [...conjuncts(node.left), ...conjuncts(node.right)]
  if (ParensNode.is(node)) return conjuncts(node.node)
  return [node]
}

const isScopeCondition = (term: OperationNode, scoped: ScopedTable, qualifier: TableNode, organization: Organization) => {
  if (organization === undefined) return RawNode.is(term) && term.sqlFragments.length === 1 && term.sqlFragments[0] === 'false'
  if (!BinaryOperationNode.is(term) || !OperatorNode.is(term.operator) || term.operator.operator !== '=') return false
  const { leftOperand: left, rightOperand: right } = term
  return ReferenceNode.is(left) && ColumnNode.is(left.column) && left.column.column.name === scoped.column && left.table !== undefined && sameTable(left.table, qualifier) && ValueNode.is(right) && isOrganization(right.value, organization)
}

/**
 * Whether a condition already holds the scope's for this table, as Kysely runs the plugins again over a query it
 * already transformed, such as a subquery built on the same database: the scope then adds nothing.
 */
export const holdsScope = (condition: OperationNode | undefined, scoped: ScopedTable, qualifier: TableNode, organization: Organization) =>
  condition !== undefined && conjuncts(condition).some((term) => isScopeCondition(term, scoped, qualifier, organization))

// The existing condition in parentheses, so an `or` in it cannot take the scope's condition into one of its sides.
const and = (existing: OperationNode, condition: OperationNode) => AndNode.create(ParensNode.create(existing), condition)

export const andWhere = (where: WhereNode | undefined, condition: OperationNode) => (where ? WhereNode.create(and(where.where, condition)) : WhereNode.create(condition))

export const andOn = (on: OnNode | undefined, condition: OperationNode) => (on ? OnNode.create(and(on.on, condition)) : OnNode.create(condition))

/** Whether a value a query writes is the organization itself, as a literal: anything else is refused. */
export const isOrganization = (value: unknown, organization: Organization) =>
  organization !== undefined && (typeof value === 'string' || typeof value === 'number') && String(value) === String(organization)

/** The value a node writes, when it is a literal. */
export const literalOf = (node: OperationNode): { value: unknown } | undefined => (ValueNode.is(node) ? { value: node.value } : undefined)
