import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import type { ListDisplayRow } from '../displays/list-displays'
import { rankedPlace } from './ranked-place'

const model = resource('tasks').table('tasks').fields({ id: f.integer(), status: f.text(), rank: f.integer().sortable() }).primaryKey((r) => r.id).position((r) => r.rank).toModel()
const card = (id: number, rank: number): ListDisplayRow => ({ key: String(id), record: { id, status: 'queued', rank }, labels: {} })
// Queued: 1, 2, 3 and 4 at ranks 1 to 4
const queued = [card(1, 1), card(2, 2), card(3, 3), card(4, 4)]
const bound = (key: string, rank: number, title: string) => ({ key, rank, title })
const place = (row: ListDisplayRow, index: number, after: ReturnType<typeof bound>[], before: ReturnType<typeof bound>[] = []) =>
  rankedPlace({ model, rank: 'rank', rows: queued, row, index, bounds: { after, before }, title: 'Order pads' })

describe('rankedPlace', () => {
  it('takes the place a drop keeps in order', () => {
    expect(place(queued[3]!, 2, [bound('2', 2, 'Fix the clamp')])).toEqual({ place: { index: 2 } })
  })

  it('lands below a card of the column it depends on, by the ranks the move gives, saying why', () => {
    expect(place(queued[3]!, 0, [bound('2', 2, 'Fix the clamp')])).toEqual({ place: { index: 2 }, reason: 'Order pads depends on Fix the clamp.' })
  })

  it('takes a rank above a record of another column ranked above the whole column, in the last place', () => {
    expect(place(queued[0]!, 0, [bound('9', 7, 'Ship it')])).toEqual({ place: { index: 3, bump: 8 }, reason: 'Order pads depends on Ship it.' })
    expect(place(card(5, 20), 1, [bound('9', 7, 'Ship it')])).toEqual({ place: { index: 4, bump: 8 }, reason: 'Order pads depends on Ship it.' })
  })

  it('stays above what depends on it, and has no place when nothing below keeps the order', () => {
    expect(place(queued[0]!, 3, [], [bound('3', 3, 'Paint')])).toEqual({ reason: 'Paint depends on Order pads.' })
    expect(place(queued[0]!, 1, [], [bound('3', 3, 'Paint')])).toEqual({ place: { index: 1 } })
    expect(place(queued[0]!, 0, [bound('9', 7, 'Ship it')], [bound('8', 8, 'Paint')])).toEqual({ reason: 'Order pads depends on Ship it.' })
  })
})
