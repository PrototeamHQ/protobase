import { describe, expect, it } from 'vitest'
import { f } from './fields'
import { resource } from './resource'
import { rowButtonErrors, rowButtonFields } from './row-button'

const tasks = resource('tasks').table('tasks').fields({ id: f.integer(), title: f.text() }).primaryKey((r) => r.id).toModel()
const holds = resource('holds')
  .table('holds')
  .fields({ id: f.integer(), task_id: f.relation('tasks'), verb: f.text() })
  .primaryKey((r) => r.id)
  .toModel()
const models = { tasks, holds }

describe('rowButtonFields', () => {
  it('names the fields its label and address read, once each', () => {
    expect(rowButtonFields({ label: '{verb}', to: { kind: 'record', resource: 'tasks', key: '{task_id}', tab: 'Review' } })).toEqual(['verb', 'task_id'])
    expect(rowButtonFields({ label: 'Open {verb}', to: { kind: 'record', resource: 'holds', key: '{id}', run: '{verb}' } })).toEqual(['verb', 'id'])
  })
})

describe('rowButtonErrors', () => {
  it('accepts a label and an address whose fields the rows have', () => {
    expect(rowButtonErrors({ label: '{verb}', to: { kind: 'record', resource: 'tasks', key: '{task_id}', tab: 'Review' } }, holds, { models })).toEqual([])
  })

  it('names a label or an address field the rows do not have', () => {
    expect(rowButtonErrors({ label: '{action}', to: { kind: 'record', resource: 'tasks', key: '{task}' } }, holds, { models })).toEqual([
      'label: "{action}" is not a field of holds',
      'to: "{task}" is not a field of holds',
    ])
  })

  it('names an address that cannot be followed', () => {
    expect(rowButtonErrors({ label: 'Open', to: { kind: 'record', resource: 'bikes', key: '{id}' } }, holds, { models })).toEqual(['to: unknown resource "bikes"'])
  })

  it('needs a label and an address', () => {
    expect(rowButtonErrors('Open', holds, { models })).toEqual(["a row button is { label, to }, such as { label: 'Open', to: { kind: 'record', resource: 'tasks', key: '{id}' } }"])
    expect(rowButtonErrors({ label: ' ', to: { kind: 'page', page: 'today' } }, holds, { models })).toEqual(['a row button needs a label'])
    expect(rowButtonErrors({ label: 'Open' }, holds, { models })).toEqual(["a row button needs an address in `to`, such as { kind: 'record', resource: 'tasks', key: '{id}' }"])
  })
})
