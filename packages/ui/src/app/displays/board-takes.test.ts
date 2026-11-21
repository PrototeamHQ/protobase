import { describe, expect, it } from 'vitest'
import { resource, f } from '@protobase/schema'
import { boardSet, boardTakes } from './board-takes'

const model = resource('tasks').table('tasks')
  .fields({ id: f.integer(), status: f.enum(['parked', 'queued', 'running']).readOnly(), lane: f.enum(['parked', 'queued']).optional(), stage: f.enum(['parked', 'queued', 'running']) })
  .primaryKey((r) => r.id)
  .toModel()
const values = ['parked', 'queued', 'running', null]
const taking = (by: string, drag: Parameters<typeof boardTakes>[2], drop?: Parameters<typeof boardTakes>[3]) => values.filter(boardTakes(model, by, drag, drop))

describe('boardTakes', () => {
  it('takes a card in every column with board: true while by is writable', () => {
    expect(taking('stage', true)).toEqual(values)
    expect(taking('status', true)).toEqual([])
  })
  it('takes a card only in the columns a set names, writing a field other than a read-only by', () => {
    expect(taking('status', { set: 'lane', columns: ['parked', 'queued'] })).toEqual(['parked', 'queued'])
    expect(taking('status', { set: 'lane' })).toEqual(values)
    expect(taking('stage', { columns: ['queued'] })).toEqual(['queued'])
  })
  it('takes no card when the set field is read-only', () => {
    expect(taking('status', { columns: ['parked'] })).toEqual([])
  })
  it('takes a card in the columns a board drop lists', () => {
    expect(taking('status', 'decide', { queued: async () => {} })).toEqual(['queued'])
    expect(taking('status', 'decide', undefined)).toEqual([])
  })
})

describe('boardSet', () => {
  it('is the set field, by when the form names none, and nothing for another form', () => {
    expect(boardSet({ set: 'lane' }, 'status')).toBe('lane')
    expect(boardSet({ columns: ['parked'] }, 'status')).toBe('status')
    expect(boardSet(true, 'status')).toBeUndefined()
    expect(boardSet('decide', 'status')).toBeUndefined()
  })
})
