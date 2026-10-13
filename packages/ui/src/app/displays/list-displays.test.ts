import { describe, expect, it } from 'vitest'
import { f, resource, view, type FieldModel, type ListDisplayModel } from '@protobase/schema'
import { amountParts, defaultDisplay, displayChoices, displayRow, filledAmount, filledMeta, loadedFields, mapCards, shownDisplay, shownFields, sortFields } from './list-displays'

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

  it('opens the display the caller prefers instead of the default, a cards display still below sm', () => {
    expect(defaultDisplay(boardView, false, 'table')).toBe('table')
    expect(defaultDisplay(boardView, true, 'table')).toBe('cards')
    expect(defaultDisplay(undefined, false, 'table')).toBe('table')
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

describe('filledAmount', () => {
  it('takes the first amount field with a value', () => {
    expect(filledAmount({ key: '1', record: { purchase_price: null, rent_price: '1450.00' }, labels: {} }, ['purchase_price', 'rent_price'])).toBe('rent_price')
    expect(filledAmount({ key: '1', record: { purchase_price: '425000.00', rent_price: '1450.00' }, labels: {} }, ['purchase_price', 'rent_price'])).toBe('purchase_price')
    expect(filledAmount({ key: '1', record: { purchase_price: null }, labels: {} }, ['purchase_price'])).toBeUndefined()
  })
})

const field = (type: FieldModel['type']) => ({ name: 'x', column: 'x', type, nullable: false, readOnly: false, filterable: false, sortable: false, aliases: [] }) as FieldModel

describe('amountParts', () => {
  it('splits a number with its prefix from its suffix, and leaves anything else whole', () => {
    expect(amountParts(field('decimal'), '1450.00', { prefix: '€', suffix: ' /month', decimals: 0 })).toEqual({ amount: '€1,450', suffix: ' /month' })
    expect(amountParts(field('decimal'), '425000.00', { prefix: '€', decimals: 0 })).toEqual({ amount: '€425,000' })
    expect(amountParts(field('integer'), 120, { suffix: ' m²' })).toEqual({ amount: '120', suffix: ' m²' })
    expect(amountParts(field('text'), 'soon', { suffix: ' /month' })).toEqual({ amount: 'soon' })
  })
})

describe('mapCards', () => {
  const places = resource('places').table('places').fields({ id: f.integer(), name: f.text(), area: f.text(), lat: f.decimal({ precision: 8, scale: 6 }), lng: f.decimal({ precision: 9, scale: 6 }) }).primaryKey((r) => r.id)
  const placesModel = places.toModel()
  const mapped = (cards?: string) =>
    view<typeof places>('places')
      .title((r) => r.name)
      .list((r, d) => ({ columns: [r.name], displays: [d.cards({ subtitle: r.area }), d.cards({ meta: [r.area] }, { name: 'small' }), d.map({ latitude: r.lat, longitude: r.lng }, { ...(cards && { cards }) })] }))
      .toModel(placesModel)

  it("shows the card of the cards display it names, else the list's first, and loads the position with the card's fields", () => {
    const first = mapped()
    const map = shownDisplay(first, 'map') as Extract<ListDisplayModel, { kind: 'map' }>
    expect(mapCards(first, map)).toMatchObject({ name: 'cards', subtitle: 'area' })
    expect(shownFields(placesModel, first, map)).toEqual(['lat', 'lng', 'name', 'area'])
    const small = mapped('small')
    expect(mapCards(small, shownDisplay(small, 'map') as Extract<ListDisplayModel, { kind: 'map' }>)).toMatchObject({ name: 'small', meta: ['area'] })
    expect(displayChoices(first).at(-1)).toEqual({ name: 'map', label: 'Map', icon: 'map' })
  })

  it('shows the title alone without a cards display', () => {
    const alone = view<typeof places>('places').list((r, d) => ({ columns: [r.name], displays: [d.map({ latitude: r.lat, longitude: r.lng })] })).toModel(placesModel)
    expect(mapCards(alone, alone.list!.displays![0] as Extract<ListDisplayModel, { kind: 'map' }>)).toEqual({ kind: 'cards', name: 'map' })
  })
})
