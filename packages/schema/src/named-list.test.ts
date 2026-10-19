import { describe, expect, it } from 'vitest'
import type { ViewModel } from './model'
import { viewOfList } from './named-list'

const base: ViewModel = {
  resource: 'changelog',
  title: 'title',
  fields: {},
  names: { singular: 'Entry', plural: 'Entries' },
  nav: { order: 1 },
  help: 'All entries',
  list: { columns: ['title'] },
  chart: { kind: 'count', field: 'closed_on', granularity: 'day' } as never,
  filters: [],
  layout: [{ kind: 'group', title: 'G' } as never],
  actions: [],
  lists: [{ name: 'updates', names: { singular: 'Update', plural: 'Updates' }, filters: [] }],
}

describe('viewOfList', () => {
  it('returns the same view without a list name', () => {
    expect(viewOfList(base, undefined)).toBe(base)
  })

  it('replaces the list parts with the named list and keeps the rest', () => {
    const shown = viewOfList(base, 'updates')!
    expect(shown.names).toEqual({ singular: 'Update', plural: 'Updates' })
    expect(shown.lists).toBeUndefined()
    expect(shown.title).toBe('title')
    expect(shown.layout).toBe(base.layout)
  })

  it('does not leak the view list, chart, help or nav into a named list without them', () => {
    const shown = viewOfList(base, 'updates')!
    expect(shown.list).toBeUndefined()
    expect(shown.chart).toBeUndefined()
    expect(shown.help).toBeUndefined()
    expect(shown.nav).toBeUndefined()
  })

  it('gives none for an unknown list or view', () => {
    expect(viewOfList(base, 'nope')).toBeUndefined()
    expect(viewOfList(undefined, 'updates')).toBeUndefined()
  })
})
