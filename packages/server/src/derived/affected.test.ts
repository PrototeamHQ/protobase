import { describe, expect, it } from 'vitest'
import type { ResourceChange } from '../changes/resource-change'
import { changeKeys, touches, type StoredRead } from './affected'

const types = { id: 'integer', objective_id: 'relation', status: 'enum', title: 'text' }

const change = (operation: ResourceChange['operation'], before: Record<string, unknown> | undefined, after: Record<string, unknown> | undefined, changed: string[] = []): ResourceChange => ({
  resource: 'tasks',
  key: String((after ?? before)!.id),
  operation,
  ...(before && { before }),
  ...(after && { after }),
  changed,
  actor: null,
  source: 'database',
  databaseRole: null,
  transaction: '1',
  sequence: '1',
  at: '2026-11-10T00:00:00.000Z',
})

// A list read: the open tasks of objective 3, by their status and objective.
const list: StoredRead = { name: 'objectives.verdict', key: '3', resource: 'tasks', condition: { and: [{ field: 'objective_id', op: '=', value: 3 }, { field: 'status', op: '=', value: 'open' }] }, fields: ['objective_id', 'status'] }
// A get by key: task 5, every field.
const get: StoredRead = { name: 'tasks.summary', key: '5', resource: 'tasks', condition: { field: 'id', op: '=', value: 5 }, fields: null }

describe('touches', () => {
  it('catches a new row that matches a list read, and a row that leaves it', () => {
    expect(touches(list, change('create', undefined, { id: 9, objective_id: 3, status: 'open' }), types)).toBe(true)
    expect(touches(list, change('update', { id: 9, objective_id: 3, status: 'open' }, { id: 9, objective_id: 3, status: 'done' }, ['status']), types)).toBe(true)
  })

  it('passes over a change to another row, or to a field the read did not use', () => {
    expect(touches(list, change('create', undefined, { id: 9, objective_id: 4, status: 'open' }), types)).toBe(false)
    expect(touches(list, change('update', { id: 9, objective_id: 3, status: 'open', title: 'a' }, { id: 9, objective_id: 3, status: 'open', title: 'b' }, ['title']), types)).toBe(false)
  })

  it('catches a change to the record a get read, and no other', () => {
    expect(touches(get, change('update', { id: 5, title: 'a' }, { id: 5, title: 'b' }, ['title']), types)).toBe(true)
    expect(touches(get, change('delete', { id: 5, title: 'a' }, undefined), types)).toBe(true)
    expect(touches(get, change('update', { id: 6, title: 'a' }, { id: 6, title: 'b' }, ['title']), types)).toBe(false)
  })
})

describe('changeKeys', () => {
  it('gives each value a change holds before and after once, for the equality index', () => {
    const keys = changeKeys([change('update', { id: 5, objective_id: 3, status: 'open' }, { id: 5, objective_id: 4, status: 'open' }, ['objective_id'])], () => types)
    expect(keys).toEqual([['tasks', 'id', '5'], ['tasks', 'objective_id', '3'], ['tasks', 'status', 'open'], ['tasks', 'objective_id', '4']])
  })
})
