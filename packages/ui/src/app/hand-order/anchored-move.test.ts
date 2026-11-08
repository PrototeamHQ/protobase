import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { anchoredMove } from './anchored-move'

const model = resource('products').table('products').fields({ id: f.integer(), rank: f.integer().sortable() }).primaryKey((r) => r.id).position((r) => r.rank).toModel()
const order = [{ id: 2 }, { id: 1 }, { id: 3 }]

describe('anchoredMove', () => {
  it('anchors the record to the one above it and names the one below', () => {
    expect(anchoredMove(model, 'rank', '', order, 1)).toEqual({ op: 'move', resource: 'products', field: 'rank', key: 1, after: 2, before: 3 })
  })

  it('has no anchor first and nothing below last, and carries the list filter', () => {
    expect(anchoredMove(model, 'rank', 'id > 0', order, 0)).toMatchObject({ after: null, before: 1, filter: 'id > 0' })
    expect(anchoredMove(model, 'rank', '', order, 2)).toMatchObject({ after: 1, before: null })
  })

  it('leaves the record below unchecked when the last one shown has more after it', () => {
    expect(anchoredMove(model, 'rank', '', order, 2, true)).not.toHaveProperty('before')
    expect(anchoredMove(model, 'rank', '', order, 1, true)).toMatchObject({ before: 3 })
  })
})
