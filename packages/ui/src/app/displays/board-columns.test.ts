import { describe, expect, it } from 'vitest'
import { ApiError } from '@protobase/client'
import { f, resource, view } from '@protobase/schema'
import { boardCard, boardColumns, columnFilter, refusalReason, type BoardDisplayModel } from './board-columns'
import { shownFields } from './list-displays'

const repairs = resource('repairs')
  .table('repairs')
  .fields({
    id: f.integer(),
    number: f.text().sortable(),
    status: f.enum(['booked', 'working', 'ready']).filterable(),
    mechanic: f.enum(['pip', 'sam']).optional().filterable(),
    bookedOn: f.date().sortable(),
  })
  .primaryKey((r) => r.id)
const model = repairs.toModel()
const workshop = view<typeof repairs>('repairs')
  .title((r) => r.number)
  .fields((r) => ({ status: r.status.valueLabels({ working: 'In the stand' }), mechanic: r.mechanic.label('Mechanic') }))
  .list((r, d) => ({ columns: [r.number], displays: [d.board({ by: r.status, meta: [r.bookedOn] }), d.board({ by: r.mechanic, subtitle: r.status }, { name: 'mechanics' })] }))
  .toModel(model)
const [byStatus, byMechanic] = workshop.list!.displays as BoardDisplayModel[]

describe('boardColumns', () => {
  it("has a column per value in the enum's order, headed by its value label", () => {
    expect(boardColumns(model, workshop, byStatus!)).toEqual([
      { value: 'booked', label: 'booked' },
      { value: 'working', label: 'In the stand' },
      { value: 'ready', label: 'ready' },
    ])
  })

  it('adds a column for the records without a value when the field may be empty', () => {
    expect(boardColumns(model, workshop, byMechanic!).at(-1)).toEqual({ value: null, label: 'No mechanic' })
  })
})

describe('columnFilter', () => {
  it("adds the column's value to the list's filter", () => {
    expect(columnFilter('', 'status', 'ready')).toBe('status = "ready"')
    expect(columnFilter('search("gazelle") OR mechanic = "pip"', 'status', 'ready')).toBe('(search("gazelle") OR mechanic = "pip") AND status = "ready"')
    expect(columnFilter('', 'mechanic', null)).toBe('isNull(mechanic)')
  })
})

describe('boardCard', () => {
  it("draws the board's fields as a built-in card, titled by the view's title without one", () => {
    expect(boardCard(model, workshop, byStatus!)).toEqual({ kind: 'cards', name: 'board', title: 'number', meta: ['bookedOn'] })
  })

  it('loads the column field and the fields of the card', () => {
    expect(shownFields(model, workshop, byMechanic!)).toEqual(['mechanic', 'number', 'status'])
  })
})

describe('refusalReason', () => {
  it("says why the server refused a move, by the reasons it gives, else by its detail", () => {
    const refused = new ApiError({ type: 'urn:problem:validation-failed', title: 'Validation failed', status: 422, errors: [{ field: 'paid', message: 'A bike leaves the shop paid' }] })
    expect(refusalReason(refused)).toBe('A bike leaves the shop paid')
    expect(refusalReason(new ApiError({ type: 'urn:problem:forbidden', title: 'Forbidden', status: 403, detail: 'You may not update this repair' }))).toBe('You may not update this repair')
  })
})
