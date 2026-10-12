import { describe, expect, it } from 'vitest'
import { f, resource, view } from '@protobase/schema'
import { defaultDisplay, displayChoices, displayRow, filledMeta, loadedFields, shownDisplay, sortFields } from './list-displays'

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

describe('defaultDisplay', () => {
  it('opens the default, or the table, from the sm breakpoint up', () => {
    expect(defaultDisplay(boardView, false)).toBe('board')
    expect(defaultDisplay(undefined, false)).toBe('table')
  })

  it('opens a cards display below sm: the default when it is one, else the first, never a custom display', () => {
    expect(defaultDisplay(boardView, true)).toBe('cards')
    const twoCards = view<typeof repairs>('repairs')
      .list((r, d) => ({ columns: [r.number], displays: [d.cards({}), d.cards({ meta: [r.bookedOn] }, { name: 'compact' })], default: 'compact' }))
      .toModel()
    expect(defaultDisplay(twoCards, true)).toBe('compact')
    const customOnly = view<typeof repairs>('repairs')
      .list((r, d) => ({ columns: [r.number], displays: [d.custom(Board, { name: 'board', label: 'Board', fields: [r.number], props: { by: r.status } })] }))
      .toModel()
    expect(defaultDisplay(customOnly, true)).toBe('table')
    expect(defaultDisplay(undefined, true)).toBe('table')
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

  it("loads a card's image with the rest of the card", () => {
    const pictured = resource('repairs').table('repairs').fields({ id: f.integer(), number: f.text(), photo: f.file().accept(['image/*']) }).primaryKey((r) => r.id)
    const cards = view<typeof pictured>('repairs').list((r, d) => ({ columns: [r.number], displays: [d.cards({ image: r.photo })] })).toModel(pictured.toModel())
    expect(loadedFields(pictured.toModel(), cards, ['number'])).toEqual(['number', 'photo'])
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

describe('filledMeta', () => {
  it('keeps the meta fields with a value, false and zero included, in order', () => {
    const row = { key: '1', record: { purchase_price: null, rent_price: '1450.00', bedrooms: 0, garden: false, note: '' }, labels: {} }
    expect(filledMeta(row, ['purchase_price', 'rent_price', 'bedrooms', 'garden', 'note', 'missing'])).toEqual(['rent_price', 'bedrooms', 'garden'])
  })
})
