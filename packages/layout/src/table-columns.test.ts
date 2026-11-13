import { describe, expect, it } from 'vitest'
import { columnsByPriority, phoneColumns, type ColumnTraits } from './table-columns'

const traits =
  (of: Record<string, ColumnTraits>) =>
  (name: string): ColumnTraits =>
    of[name] ?? {}

describe('phoneColumns', () => {
  it('shows the columns given a priority and hides the rest', () => {
    expect(phoneColumns(['rank', { name: 'title', priority: 2 }, { name: 'verdict', priority: 1 }], traits({}))).toEqual(['title', 'verdict'])
  })

  it('keeps the title and the badge columns over plain ones when no priority is given', () => {
    const columns = ['rank', 'points', 'title', 'notes', 'state']
    expect(phoneColumns(columns, traits({ title: { title: true }, state: { badge: true } }))).toEqual(['rank', 'title', 'state'])
  })

  it('shows at most three of the columns given a priority, the lowest numbers first', () => {
    const columns = [
      { name: 'a', priority: 4 },
      { name: 'b', priority: 1 },
      { name: 'c', priority: 3 },
      { name: 'd', priority: 2 },
    ]
    expect(phoneColumns(columns, traits({}))).toEqual(['b', 'c', 'd'])
  })

  it('shows every column of a table that has three or fewer', () => {
    expect(phoneColumns(['rank', 'title', 'verdict'], traits({}))).toEqual(['rank', 'title', 'verdict'])
  })
})

describe('columnsByPriority', () => {
  it('puts the given priorities first, then the title, badges and the rest in table order', () => {
    const columns = ['rank', 'state', 'title', { name: 'verdict', priority: 1 }, 'notes']
    expect(columnsByPriority(columns, traits({ title: { title: true }, state: { badge: true } }))).toEqual(['verdict', 'title', 'state', 'rank', 'notes'])
  })
})
