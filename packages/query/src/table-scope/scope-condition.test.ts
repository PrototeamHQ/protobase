import { AndNode, BinaryOperationNode, ColumnNode, OperatorNode, OrNode, ParensNode, ReferenceNode, TableNode, ValueNode } from 'kysely'
import { describe, expect, it } from 'vitest'
import { holdsScope, scopeCondition } from './scope-condition'

const member = { schema: 'auth', table: 'member', column: 'organization_id' }
const table = TableNode.createWithSchema('auth', 'member')
const scope = scopeCondition(member, table, 'org-a')
const other = BinaryOperationNode.create(ReferenceNode.create(ColumnNode.create('role')), OperatorNode.create('='), ValueNode.create('owner'))

describe('holdsScope', () => {
  it("finds the scope's condition among the terms a condition ands together", () => {
    expect(holdsScope(AndNode.create(ParensNode.create(other), scope), member, table, 'org-a')).toBe(true)
    expect(holdsScope(AndNode.create(ParensNode.create(OrNode.create(other, other)), scope), member, table, 'org-a')).toBe(true)
  })

  it('does not take an and beside a bare or, which prints as a or b and c, as holding it', () => {
    expect(holdsScope(AndNode.create(OrNode.create(other, other), scope), member, table, 'org-a')).toBe(false)
    expect(holdsScope(OrNode.create(other, scope), member, table, 'org-a')).toBe(false)
  })

  it("does not take another organization's condition", () => {
    expect(holdsScope(scope, member, table, 'org-b')).toBe(false)
  })
})
