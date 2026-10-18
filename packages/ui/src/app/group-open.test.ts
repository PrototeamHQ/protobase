import { describe, expect, it } from 'vitest'
import type { GroupModel } from '@protobase/schema'
import { groupOpen, toggledOpen } from './group-open'

const group = (collapsed?: boolean): GroupModel => ({
  kind: 'group',
  title: 'More',
  ...(collapsed && { collapsed }),
  items: [
    { kind: 'section', title: 'Details', fields: ['note'] },
    { kind: 'related', title: 'Parts', resource: 'parts', field: 'repair_id' },
  ],
})
const never = () => false

describe('toggledOpen', () => {
  it('adds a closed group and removes an open one', () => {
    expect(toggledOpen(undefined, 'More')).toEqual(['More'])
    expect(toggledOpen(['A'], 'More')).toEqual(['A', 'More'])
    expect(toggledOpen(['A', 'More'], 'More')).toEqual(['A'])
  })
})

describe('groupOpen', () => {
  it('is open unless collapsed', () => {
    expect(groupOpen(group(), [], never)).toBe(true)
    expect(groupOpen(group(true), [], never)).toBe(false)
  })

  it('is open when the address names it', () => {
    expect(groupOpen(group(true), ['More'], never)).toBe(true)
    expect(groupOpen(group(true), ['Other'], never)).toBe(false)
  })

  it('is open when a section holds a field that needs attention, and ignores related tables', () => {
    expect(groupOpen(group(true), [], (field) => field === 'note')).toBe(true)
    expect(groupOpen(group(true), [], (field) => field === 'repair_id')).toBe(false)
  })
})
