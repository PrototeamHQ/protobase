import { describe, expect, it } from 'vitest'
import { checkFilter, f, parseFilter, resource, type KeyType } from '@protobase/schema'
import { changeCondition } from './change-condition'

const orders = resource('orders')
  .table('orders')
  .fields({
    id: f.integer().filterable(),
    title: f.text().filterable().column('order_title'),
    total: f.decimal({ precision: 12, scale: 2 }).filterable(),
    paid: f.boolean().filterable(),
    meta: f.json().filterable(),
    placed_at: f.timestamp().filterable(),
    customer_id: f.relation('customers').filterable(),
    owner_id: f.relation('owners').filterable(),
    line_id: f.relation('lines').filterable(),
  })
  .primaryKey((r) => r.id)
  .search((r) => [r.title])
  .toModel()

const condition = (source: string) => {
  const parsed = parseFilter(source)
  if (!parsed.ok || !parsed.ast) throw new Error(`parse failed: ${source}`)
  const checked = checkFilter(orders, parsed.ast)
  if (!checked.ok || !checked.filter) throw new Error(`check failed: ${source}`)
  return changeCondition(checked.filter, keyTypesOf)
}

const keyTypes: Record<string, KeyType[]> = { customers: ['integer'], owners: ['text'], lines: ['integer', 'integer'] }
const keyTypesOf = (resource: string) => keyTypes[resource]

describe('changeCondition', () => {
  it.each([
    ['id = 5', { eq: ['id', 5] }],
    ['id != 5', { neq: ['id', 5] }],
    ['id < 5', { lt: ['id', 5] }],
    ['id <= 5', { lte: ['id', 5] }],
    ['id > 5', { gt: ['id', 5] }],
    ['id >= 5', { gte: ['id', 5] }],
    ['in(id, 1, 2)', { in: ['id', [1, 2]] }],
    ['isNull(total)', { is_null: 'total' }],
    ['total:*', { not: { is_null: 'total' } }],
    ['id = 1 AND paid = true', { and: [{ eq: ['id', 1] }, { eq: ['paid', true] }] }],
    ['id = 1 OR id = 2', { or: [{ eq: ['id', 1] }, { eq: ['id', 2] }] }],
    ['NOT id = 1', { not: { eq: ['id', 1] } }],
  ])('writes %s', (source, expected) => {
    expect(condition(source)).toEqual(expected)
  })

  it("names the field's column", () => {
    expect(condition('title = "a"')).toEqual({ eq: ['order_title', 'a'] })
  })

  it('compares a relation as the key it points at', () => {
    expect(condition('customer_id = 4')).toEqual({ eq: ['customer_id', 4] })
    expect(condition('in(owner_id, "ann", "bo")')).toEqual({ in: ['owner_id', ['ann', 'bo']] })
  })

  it.each([
    ['a number for a text key', 'owner_id = 4'],
    ['a key of several parts', 'line_id = 4'],
    ['a search', 'search("a")'],
    ['similar', 'similar(title, "a")'],
    ['regex', 'regex(title, "^a")'],
    ['a text pattern', 'title = "a*"'],
    ['a JSON field', 'meta:"a"'],
    ['a JSON field present', 'meta:*'],
    ['a timestamp', 'placed_at > 2026-01-01T00:00:00Z'],
    ['now()', 'placed_at > now() - 7d'],
    ['an order on text', 'title > "a"'],
    ['one such part of an AND', 'id = 1 AND regex(title, "^a")'],
    ['one such part under NOT', 'NOT similar(title, "a")'],
  ])('has no condition for %s', (_, source) => {
    expect(condition(source)).toBeUndefined()
  })
})
