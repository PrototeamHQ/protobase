import { describe, expect, it } from 'vitest'
import type { ListDisplayModel, ViewModel } from '@protobase/schema'
import { cardDotsLines } from './card-dots-lines'

const tasks = { name: 'tasks', resource: 'tasks', field: 'id', status: 'status' }
const notes = { name: 'notes', resource: 'notes', field: 'objective_id', status: 'kind' }
const view = { resource: 'objectives', fields: {}, filters: [], layout: [], actions: [], list: { columns: ['title', 'tasks', 'notes'], relatedColumns: [tasks, notes] } } as ViewModel
const cards = (dots?: string[]): Extract<ListDisplayModel, { kind: 'cards' }> => ({ kind: 'cards', name: 'cards', ...(dots && { dots }) })
const row = (record: Record<string, unknown>) => ({ key: '1', record: { id: 1, ...record }, labels: {} })

describe('cardDotsLines', () => {
  it('gives each related column the card names its loaded records, in the order the card names them', () => {
    const done = { id: 7, status: 'done' }
    const idea = { id: 3, kind: 'idea' }
    expect(cardDotsLines(view, cards(['notes', 'tasks']), row({ tasks: [done], notes: [idea] }))).toEqual([
      { column: notes, records: [idea] },
      { column: tasks, records: [done] },
    ])
  })

  it('shows no line for a column without records, or one the row was loaded without', () => {
    expect(cardDotsLines(view, cards(['tasks', 'notes']), row({ tasks: [] }))).toEqual([])
  })

  it('shows no line for a column the list does not have, and none for a card without dots', () => {
    expect(cardDotsLines(view, cards(['gone']), row({ gone: [{ id: 1 }] }))).toEqual([])
    expect(cardDotsLines(view, cards(), row({ tasks: [{ id: 7 }] }))).toEqual([])
  })
})
