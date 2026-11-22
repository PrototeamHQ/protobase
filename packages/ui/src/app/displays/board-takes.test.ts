import { describe, expect, it } from 'vitest'
import { resource, f } from '@protobase/schema'
import { boardSet, boardTakes, readsSet } from './board-takes'

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
  it('takes no card when the set field is read-only, or not in the caller\'s model at all', () => {
    expect(taking('status', { columns: ['parked'] })).toEqual([])
    expect(taking('status', { set: 'hidden' })).toEqual([])
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

describe('readsSet', () => {
  const writeOnly = { ...model, fields: { ...model.fields, lane: { ...model.fields.lane!, writeOnly: true as const, sensitive: true as const } } }
  it('loads the set field only for a caller who reads it', () => {
    expect(readsSet(model, 'lane')).toBe(true)
    expect(readsSet(writeOnly, 'lane')).toBe(false)
    expect(readsSet(model, 'hidden')).toBe(false)
  })
  it('lets a caller who may only write it move a card, without Undo', () => {
    expect(values.filter(boardTakes(writeOnly, 'status', { set: 'lane' }, undefined))).toEqual(values)
  })
})
