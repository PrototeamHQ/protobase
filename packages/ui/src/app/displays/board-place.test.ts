import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { boardRank } from './board-columns'
import { placedRows, placeOps } from './board-place'
import type { ListDisplayRow } from './list-displays'

const fields = {
  id: f.integer(),
  title: f.text(),
  status: f.enum(['todo', 'doing', 'done']).filterable(),
  rank: f.integer().sortable(),
  project_id: f.relation('projects').filterable(),
}
const tasks = resource('tasks').table('tasks').fields(fields).primaryKey((r) => r.id)
const model = tasks.position((r) => r.rank).toModel()

const card = (id: number, status: string, rank: number | null, etag?: string): ListDisplayRow => ({ key: String(id), record: { id, status, rank, ...(etag && { etag }) }, labels: {} })
const todo = [card(1, 'todo', 1, 'e1'), card(2, 'todo', 2, 'e2'), card(3, 'todo', 3, 'e3'), card(4, 'todo', 4, 'e4')]
const doing = [card(5, 'doing', 1, 'e5'), card(6, 'doing', 2, 'e6')]
const keys = (rows: ListDisplayRow[]) => rows.map((row) => row.key)

describe('boardRank', () => {
  it('is the position of records ordered as one', () => {
    expect(boardRank(model)).toBe('rank')
  })

  it('is none for records ordered within a parent, or without a position', () => {
    expect(boardRank(resource('tasks').table('tasks').fields(fields).primaryKey((r) => r.id).position((r) => r.rank, { within: (r) => r.project_id }).toModel())).toBeUndefined()
    expect(boardRank(tasks.toModel())).toBeUndefined()
  })
})

describe('placedRows', () => {
  it('moves a card within its column, as a sortable list moves it', () => {
    expect(keys(placedRows(todo, todo[2]!, 0))).toEqual(['3', '1', '2', '4'])
    expect(keys(placedRows(todo, todo[0]!, 2))).toEqual(['2', '3', '1', '4'])
    expect(keys(placedRows(todo, todo[1]!, 1))).toEqual(['1', '2', '3', '4'])
  })

  it('puts a card from another column before the card it is dropped on, or last', () => {
    expect(keys(placedRows(doing, todo[0]!, 1))).toEqual(['5', '1', '6'])
    expect(keys(placedRows(doing, todo[0]!, 2))).toEqual(['5', '6', '1'])
  })
})

describe('placeOps', () => {
  it('renumbers only the cards whose place changed, each with its ETag', () => {
    const order = placedRows(todo, todo[2]!, 0)
    expect(placeOps(model, 'status', 'rank', todo[2]!, { value: 'todo', label: 'todo' }, order, 0, 2)).toEqual([
      { op: 'reorder', resource: 'tasks', field: 'rank', keys: [3, 1, 2], start: 1, etags: { '3': 'e3', '1': 'e1', '2': 'e2' } },
    ])
    const down = placedRows(todo, todo[1]!, 2)
    expect(placeOps(model, 'status', 'rank', todo[1]!, { value: 'todo', label: 'todo' }, down, 1, 2)).toEqual([
      { op: 'reorder', resource: 'tasks', field: 'rank', keys: [3, 2], start: 2, etags: { '3': 'e3', '2': 'e2' } },
    ])
  })

  it("moves a card to another column with its ETag, then renumbers that column, the card's ETag already checked", () => {
    const order = placedRows(doing, todo[0]!, 1)
    expect(placeOps(model, 'status', 'rank', todo[0]!, { value: 'doing', label: 'doing' }, order, 1, 1)).toEqual([
      { op: 'update', resource: 'tasks', key: 1, data: { status: 'doing' }, etag: 'e1' },
      { op: 'reorder', resource: 'tasks', field: 'rank', keys: [1, 6], start: 2, etags: { '1': '*', '6': 'e6' } },
    ])
  })

  it('sends a record listed without an ETag as any', () => {
    const rows = [card(1, 'todo', 1), card(2, 'todo', 2)]
    expect(placeOps(model, 'status', 'rank', rows[1]!, { value: 'todo', label: 'todo' }, placedRows(rows, rows[1]!, 0), 0, 1)).toEqual([
      { op: 'reorder', resource: 'tasks', field: 'rank', keys: [2, 1], start: 1, etags: { '2': '*', '1': '*' } },
    ])
  })
})
