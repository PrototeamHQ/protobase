import {
  OperationNodeTransformer,
  RawNode,
  type DeleteQueryNode,
  type InsertQueryNode,
  type JoinNode,
  type MergeQueryNode,
  type OperationNode,
  type QueryId,
  type SelectQueryNode,
  type TableNode,
  type UpdateQueryNode,
  type WhereNode,
  type WithNode,
} from 'kysely'
import { checkRawTables, isUnscopedMark, scopedMark, scopedRows } from './raw-tables'
import { andOn, andWhere, holdsScope, scopeCondition, type Organization } from './scope-condition'
import { checkColumnUpdates, scopeInsert } from './scope-insert'
import { scopedTableOf, tableItem, type ScopedTables } from './scoped-tables'

// A join whose table's filter goes in its `on`: an outer join keeps the rows of the other side, with nulls for this one.
const filteredInOn = new Set<JoinNode['joinType']>(['InnerJoin', 'LeftJoin', 'LateralInnerJoin', 'LateralLeftJoin'])
// A join whose table's filter goes in the `where`: no other side keeps rows it does not match.
const filteredInWhere = new Set<JoinNode['joinType']>(['CrossJoin', 'LateralCrossJoin'])

const cteNames = (node: WithNode | undefined) => (node?.expressions ?? []).map((expression) => expression.name.table.table.identifier.name)

/**
 * Keeps every query on a scoped table to one organization, at the select, update or delete that reads the table: a
 * table in its `from`, `using` or as its target is filtered in its `where`, a joined one in the join's `on`. A
 * subquery, a common table expression or `exists` filters its own tables; a name a common table expression takes is
 * not the table. Inserts write the organization; raw SQL may name a scoped table only through `scoped()` or `unscoped()`.
 */
export class ScopeTransformer extends OperationNodeTransformer {
  // The names of the common table expressions each enclosing query level sees.
  #frames: ReadonlySet<string>[] = []

  constructor(
    readonly scope: ScopedTables,
    readonly organization: Organization,
  ) {
    super()
  }

  #shadowing() {
    return new Set(this.#frames.flatMap((frame) => [...frame]))
  }

  #inLevel<Node>(withNode: WithNode | undefined, work: () => Node): Node {
    this.#frames.push(new Set(cteNames(withNode)))
    const done = work()
    this.#frames.pop()
    return done
  }

  #scoped(node: TableNode) {
    return scopedTableOf(this.scope, node, this.#shadowing())
  }

  // The `where` with the filter of each scoped table among `items`.
  #filterItems(where: WhereNode | undefined, items: readonly OperationNode[]) {
    let filtered = where
    for (const node of items) {
      const item = tableItem(node)
      const scoped = item && this.#scoped(item.table)
      if (scoped && !holdsScope(filtered?.where, scoped, item.qualifier, this.organization)) filtered = andWhere(filtered, scopeCondition(scoped, item.qualifier, this.organization))
    }
    return filtered
  }

  // The joins with the filter of each scoped table in its `on`, and the `where` with those of cross joins.
  #filterJoins(where: WhereNode | undefined, joins: readonly JoinNode[] | undefined, ownsScoped: boolean) {
    let filtered = where
    const scopedJoins = (joins ?? []).map((join) => {
      const item = tableItem(join.table)
      const scoped = item && this.#scoped(item.table)
      if (!scoped) {
        if (ownsScoped && (join.joinType === 'RightJoin' || join.joinType === 'FullJoin')) throw new Error('Not implemented: a right or full join in a query of a scoped table')
        return join
      }
      const condition = scopeCondition(scoped, item.qualifier, this.organization)
      if (filteredInOn.has(join.joinType)) return holdsScope(join.on?.on, scoped, item.qualifier, this.organization) ? join : { ...join, on: andOn(join.on, condition) }
      if (filteredInWhere.has(join.joinType)) {
        if (!holdsScope(filtered?.where, scoped, item.qualifier, this.organization)) filtered = andWhere(filtered, condition)
        return join
      }
      throw new Error(`Not implemented: a ${join.joinType} of a scoped table`)
    })
    return { where: filtered, joins: joins && scopedJoins }
  }

  #ownsScoped(items: readonly OperationNode[], joins: readonly JoinNode[] | undefined) {
    return [...items, ...(joins ?? []).map((join) => join.table)].some((node) => {
      const item = tableItem(node)
      return item !== undefined && this.#scoped(item.table) !== undefined
    })
  }

  // The `where` and joins of a query level whose own tables are `items` and `joins`.
  #filterLevel(where: WhereNode | undefined, items: readonly OperationNode[], joins: readonly JoinNode[] | undefined) {
    return this.#filterJoins(this.#filterItems(where, items), joins, this.#ownsScoped(items, joins))
  }

  protected override transformSelectQuery(node: SelectQueryNode, queryId?: QueryId): SelectQueryNode {
    return this.#inLevel(node.with, () => {
      const done = super.transformSelectQuery(node, queryId)
      const { where, joins } = this.#filterLevel(done.where, done.from?.froms ?? [], done.joins)
      return { ...done, ...(where && { where }), ...(joins && { joins }) }
    })
  }

  protected override transformUpdateQuery(node: UpdateQueryNode, queryId?: QueryId): UpdateQueryNode {
    return this.#inLevel(node.with, () => {
      const done = super.transformUpdateQuery(node, queryId)
      const target = done.table && tableItem(done.table)
      if (done.table && !target) throw new Error('Not implemented: an update of anything but one table')
      const scoped = target && this.#scoped(target.table)
      if (scoped) checkColumnUpdates(done.updates, scoped, this.organization, target.table)
      const { where, joins } = this.#filterLevel(done.where, [...(done.table ? [done.table] : []), ...(done.from?.froms ?? [])], done.joins)
      return { ...done, ...(where && { where }), ...(joins && { joins }) }
    })
  }

  protected override transformDeleteQuery(node: DeleteQueryNode, queryId?: QueryId): DeleteQueryNode {
    return this.#inLevel(node.with, () => {
      const done = super.transformDeleteQuery(node, queryId)
      const { where, joins } = this.#filterLevel(done.where, [...done.from.froms, ...(done.using?.tables ?? [])], done.joins)
      return { ...done, ...(where && { where }), ...(joins && { joins }) }
    })
  }

  protected override transformInsertQuery(node: InsertQueryNode, queryId?: QueryId): InsertQueryNode {
    return this.#inLevel(node.with, () => {
      const done = super.transformInsertQuery(node, queryId)
      const scoped = done.into && this.#scoped(done.into)
      return scoped ? scopeInsert(done, scoped, this.organization, done.into!) : done
    })
  }

  protected override transformMergeQuery(node: MergeQueryNode, queryId?: QueryId): MergeQueryNode {
    const tables = [node.into, node.using?.table].flatMap((table) => (table ? [tableItem(table)] : []))
    if (tables.some((item) => item && this.#scoped(item.table))) throw new Error('Not implemented: merge into or using a scoped table')
    return super.transformMergeQuery(node, queryId)
  }

  // A non-recursive common table expression sees the ones before it; a recursive one sees them all.
  protected override transformWith(node: WithNode, queryId?: QueryId): WithNode {
    const own = this.#frames.pop()!
    const names = cteNames(node)
    const expressions = node.expressions.map((expression, i) => {
      this.#frames.push(new Set(node.recursive ? names : names.slice(0, i)))
      const done = this.transformCommonTableExpression(expression, queryId)
      this.#frames.pop()
      return done
    })
    this.#frames.push(own)
    return { ...node, expressions }
  }

  protected override transformRaw(node: RawNode, queryId?: QueryId): RawNode {
    const table = scopedMark(node)
    if (table) {
      const scoped = this.#scoped(table)
      return RawNode.create(['', ''], [scoped ? scopedRows(table, scopeCondition(scoped, table, this.organization)) : table])
    }
    if (isUnscopedMark(node)) return node
    checkRawTables(this.scope, node, this.#shadowing())
    return super.transformRaw(node, queryId)
  }
}
