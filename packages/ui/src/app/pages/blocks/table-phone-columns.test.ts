import { describe, expect, it } from 'vitest'
import type { ColumnSpec } from '../../../data-grid'
import { phoneSpecs } from './table-phone-columns'

const spec = (id: string, kind: ColumnSpec['kind'] = 'text', title = false): ColumnSpec => ({ id, header: id, kind, width: 100, ...(title && { title }) })

const objectives = [spec('rank', 'number'), spec('title', 'text', true), spec('points', 'number'), spec('notes'), spec('verdict', 'status')]

const ids = (specs: ColumnSpec[]) => specs.map((shown) => shown.id)

describe('phoneSpecs', () => {
  it('shows the columns the table gives a priority, in the table order', () => {
    expect(ids(phoneSpecs(['rank', { name: 'title', priority: 2 }, { name: 'verdict', priority: 1 }])(objectives.filter((shown) => ['rank', 'title', 'verdict'].includes(shown.id))))).toEqual(['title', 'verdict'])
  })

  it('derives the title and the enum column over plain number columns when none has a priority', () => {
    expect(ids(phoneSpecs(undefined)(objectives))).toEqual(['rank', 'title', 'verdict'])
    const reordered = ['points', 'rank', 'verdict', 'title'].map((id) => objectives.find((shown) => shown.id === id)!)
    expect(ids(phoneSpecs(['points', 'rank', 'verdict', 'title'])(reordered))).toEqual(['points', 'verdict', 'title'])
  })

  it('leaves out a column the table names that has no spec, such as one the caller cannot read', () => {
    expect(ids(phoneSpecs([{ name: 'secret', priority: 1 }, { name: 'title', priority: 2 }])(objectives))).toEqual(['title'])
  })
})
