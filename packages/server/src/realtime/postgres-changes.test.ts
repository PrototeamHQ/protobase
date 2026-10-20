import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { buildRegistry } from '../registry'
import { parseBindings } from './postgres-changes'

const { entries } = buildRegistry([
  resource('todos').table('todos').fields({ id: f.integer(), user_id: f.text() }).primaryKey((r) => r.id).live(),
  resource('notes').table('app.notes').fields({ id: f.integer() }).primaryKey((r) => r.id).live(),
])
const [todos, notes] = entries

const parse = (requested: unknown) => {
  let id = 0
  return parseBindings(requested, entries, () => ++id)
}

describe('parseBindings', () => {
  it('matches each binding to the live tables it names and echoes it with its id', () => {
    const parsed = parse([
      { event: 'INSERT', schema: 'public', table: 'todos', filter: 'user_id=eq.u1' },
      { event: '*', schema: '*' },
      { event: 'update', schema: 'app' },
    ])
    expect(parsed).toMatchObject({
      bindings: [
        { id: 1, event: 'INSERT', filter: 'user_id=eq.u1', conditions: [{ column: 'user_id', operator: 'eq', value: 'u1' }], entries: [todos] },
        { id: 2, event: '*', entries: [todos, notes] },
        { id: 3, event: 'UPDATE', entries: [notes] },
      ],
      replies: [
        { id: 1, event: 'INSERT', schema: 'public', table: 'todos', filter: 'user_id=eq.u1' },
        { id: 2, event: '*', schema: '*' },
        { id: 3, event: 'update', schema: 'app' },
      ],
    })
    expect(parse(undefined)).toEqual({ bindings: [], replies: [] })
  })

  it('refuses a table that is not live, a filter on a column it has not, a bad filter and a select', () => {
    expect(parse([{ event: '*', schema: 'public', table: 'other' }])).toBe(
      'Unable to subscribe to changes with given parameters. Please check Realtime is enabled for the given connect parameters: [schema: public, table: other, filters: []]',
    )
    expect(parse([{ event: '*', schema: 'public', table: 'todos', filter: 'owner=eq.1' }])).toBe('invalid column for filter owner')
    expect(parse([{ event: '*', schema: 'public', table: 'todos', filter: 'id=in.1' }])).toBe('`in` filter value must be wrapped by parentheses')
    expect(parse([{ event: '*', schema: 'public', table: 'todos', select: ['id'] }])).toMatch(/^Not implemented: postgres_changes select/)
  })
})
