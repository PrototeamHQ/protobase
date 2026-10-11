import { describe, expect, it } from 'vitest'
import { f, resource, view } from '@protobase/schema'
import { displayChoices, displayRow, loadedFields, shownDisplay, sortFields } from './list-displays'

const repairs = resource('repairs')
  .table('repairs')
  .fields({ id: f.integer(), number: f.text().sortable(), customerId: f.relation('customers'), status: f.enum(['booked', 'ready']), bookedOn: f.date().sortable() })
  .primaryKey((r) => r.id)
const model = repairs.toModel()
const Board = Object.assign((props: { by: string }) => props, { blockName: 'Board', custom: true })
const boardView = view<typeof repairs>('repairs')
  .title((r) => r.number)
  .list((r, d) => ({
    columns: [r.number, r.status],
    displays: [d.cards({ subtitle: r.customerId, badge: r.status, meta: [r.bookedOn] }), d.custom(Board, { name: 'board', label: 'Workshop board', icon: 'kanban', fields: [r.number, r.customerId], props: { by: r.status } })],
    default: 'board',
  }))
  .toModel()

describe('shownDisplay', () => {
  it('shows the table for its name, a display for its, and the default for a name the view does not have', () => {
    expect(shownDisplay(boardView, 'table')).toBeUndefined()
    expect(shownDisplay(boardView, 'cards')).toMatchObject({ kind: 'cards' })
    expect(shownDisplay(boardView, 'calendar')).toMatchObject({ name: 'board' })
    expect(shownDisplay(view<typeof repairs>('repairs').toModel(), 'calendar')).toBeUndefined()
  })
})

describe('displayChoices', () => {
  it('offers the table first, then each display by its label or name', () => {
    expect(displayChoices(boardView)).toEqual([
      { name: 'table', label: 'Table', icon: 'table' },
      { name: 'cards', label: 'Cards', icon: 'cards' },
      { name: 'board', label: 'Workshop board', icon: 'kanban' },
    ])
  })
})

describe('loadedFields and sortFields', () => {
  it('loads the fields of every display once, the cards title being the view title', () => {
    expect(loadedFields(model, boardView, ['number', 'status'])).toEqual(['number', 'status', 'customerId', 'bookedOn'])
  })

  it('sorts a display by the sortable fields it shows', () => {
    expect(sortFields(model, boardView, shownDisplay(boardView, 'cards')!)).toEqual(['number', 'bookedOn'])
  })
})

describe('displayRow', () => {
  it('splits a loaded row into the record and the names of the records its relations point at', () => {
    expect(displayRow(model, { id: 7, number: 'R-7', customerId: { id: 3, name: 'Ada' }, status: 'ready' })).toEqual({
      key: '7',
      record: { id: 7, number: 'R-7', customerId: 3, status: 'ready' },
      labels: { customerId: 'Ada' },
    })
  })
})
