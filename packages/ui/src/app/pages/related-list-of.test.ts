import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { relatedListOf, type OwnRead } from './related-list-of'

const claims = resource('task_claims').table('task_claims').fields({ id: f.integer().readOnly(), status: f.text() }).primaryKey((r) => r.id).toModel()
const planned = { isPending: false, error: null, rows: [{ id: 1 }, { id: 2 }] }
const read = (own: Partial<OwnRead>): OwnRead => ({ pages: 0, items: [], hasNextPage: false, isFetchingNextPage: false, isPending: true, error: null, fetchNextPage: () => {}, ...own })
const state = (own: Partial<OwnRead>) => ({ model: claims, filter: 'task_id = 7', perPage: 2, more: true, planned, expanded: true, expand: () => {}, own: read(own) })

describe('relatedListOf', () => {
  it('keeps its planned rows planned while it reads its first two pages', () => {
    for (const own of [{ pages: 0 }, { pages: 1, hasNextPage: true }]) {
      const { list } = relatedListOf(state(own))
      expect(list).toMatchObject({ items: planned.rows, planned: true, loadingMore: true })
    }
  })

  it('draws the rows it read itself as its own, not planned', () => {
    const items = [{ id: 1 }, { id: 2 }, { id: 3 }]
    const { list } = relatedListOf(state({ pages: 2, items, isPending: false }))
    expect(list.items).toBe(items)
    expect(list.planned).toBeUndefined()
  })
})
