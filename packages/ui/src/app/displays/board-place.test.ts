import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { boardRank } from './board-columns'
import { boardWrites, placedRows, placeOps } from './board-place'
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
  const todoColumn = { value: 'todo', label: 'todo' }

  it('moves a card in its column, anchored to the cards around its place in that column', () => {
    expect(placeOps(model, 'status', 'rank', '', todo[2]!, todoColumn, placedRows(todo, todo[2]!, 0), false)).toEqual([
      { op: 'move', resource: 'tasks', field: 'rank', key: 3, after: null, before: 1, filter: 'status = "todo"' },
    ])
    expect(placeOps(model, 'status', 'rank', 'project_id = 7', todo[1]!, todoColumn, placedRows(todo, todo[1]!, 2), false)).toEqual([
      { op: 'move', resource: 'tasks', field: 'rank', key: 2, after: 3, before: 4, filter: '(project_id = 7) AND status = "todo"' },
    ])
  })

  it('moves a card to another column first, writing any version, as the move decides the order', () => {
    expect(placeOps(model, 'status', 'rank', '', todo[0]!, { value: 'doing', label: 'doing' }, placedRows(doing, todo[0]!, 1), false)).toEqual([
      { op: 'update', resource: 'tasks', key: 1, data: { status: 'doing' }, etag: '*' },
      { op: 'move', resource: 'tasks', field: 'rank', key: 1, after: 5, before: 6, filter: 'status = "doing"' },
    ])
  })

  it('checks only the anchor of a card dropped after the last card shown when more follow', () => {
    expect(placeOps(model, 'status', 'rank', '', todo[0]!, todoColumn, placedRows(todo, todo[0]!, 3), true)).toEqual([
      { op: 'move', resource: 'tasks', field: 'rank', key: 1, after: 4, filter: 'status = "todo"' },
    ])
  })

  it('gives a card bumped above what it depends on its rank first, then checks its place', () => {
    expect(placeOps(model, 'status', 'rank', '', todo[0]!, todoColumn, placedRows(todo, todo[0]!, 3), false, 9)).toEqual([
      { op: 'reorder', resource: 'tasks', field: 'rank', keys: [1], start: 9, etags: { '1': '*' } },
      { op: 'move', resource: 'tasks', field: 'rank', key: 1, after: 4, before: null, filter: 'status = "todo"' },
    ])
  })
})

describe('boardWrites', () => {
  it('is each record the batch wrote as it stored it last, with its values before the drop', () => {
    const moved = { ...todo[0]!.record, status: 'doing' }
    const result = {
      results: [
        { op: 'update' as const, resource: 'tasks', record: { ...moved, rank: 1 }, etag: 'u1' },
        { op: 'move' as const, resource: 'tasks', records: [{ record: { ...doing[0]!.record, rank: 1 }, etag: 'r5', previous: 1 }, { record: { ...moved, rank: 2 }, etag: 'r1', previous: 1 }] },
      ],
    }
    expect(boardWrites(model, 'rank', [doing[0]!, todo[0]!, doing[1]!], result)).toEqual([
      { before: todo[0]!.record, record: { ...moved, rank: 2 }, etag: 'r1' },
      { before: doing[0]!.record, record: { ...doing[0]!.record, rank: 1 }, etag: 'r5' },
    ])
  })

  it('puts back the ranks the server had, not those the board loaded with', () => {
    // Listed as 5, 6; meanwhile someone else gave 5 rank 3 and 6 rank 4
    const result = { results: [{ op: 'move' as const, resource: 'tasks', records: [{ record: { ...doing[1]!.record, rank: 3 }, etag: 'r6', previous: 4 }, { record: { ...doing[0]!.record, rank: 4 }, etag: 'r5', previous: 3 }] }] }
    expect(boardWrites(model, 'rank', [doing[1]!, doing[0]!], result).map((write) => write.before.rank)).toEqual([4, 3])
  })
})
