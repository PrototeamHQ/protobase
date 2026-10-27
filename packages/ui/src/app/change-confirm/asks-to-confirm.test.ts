import { describe, expect, it } from 'vitest'
import type { FieldModel } from '@protobase/schema'
import { asksToConfirm } from './asks-to-confirm'

const field = (type: FieldModel['type']) => ({ name: 'x', column: 'x', type, nullable: true, readOnly: false, filterable: false, sortable: false, aliases: [] }) as FieldModel
const confirm = { confirm: 'Sure?' }

describe('asksToConfirm', () => {
  it('asks only for a field with a question', () => {
    expect(asksToConfirm(field('boolean'), undefined, false, false, true)).toBe(false)
    expect(asksToConfirm(field('boolean'), { label: 'X' }, false, false, true)).toBe(false)
    expect(asksToConfirm(field('boolean'), confirm, false, false, true)).toBe(true)
  })

  it('asks as the value first moves away from the stored one, not on every key after', () => {
    expect(asksToConfirm(field('text'), confirm, 'draft', 'draft', 'drafts')).toBe(true)
    expect(asksToConfirm(field('text'), confirm, 'drafts', 'draft', 'draftsy')).toBe(false)
    expect(asksToConfirm(field('text'), confirm, 'drafts', 'draft', 'draft')).toBe(false)
  })

  it('does not ask for a change that keeps the stored value', () => {
    expect(asksToConfirm(field('integer'), confirm, '12', 12, '12 ')).toBe(false)
    expect(asksToConfirm(field('boolean'), confirm, false, null, false)).toBe(false)
  })

  it('asks on a new record as its value is first set', () => {
    expect(asksToConfirm(field('boolean'), confirm, false, undefined, true)).toBe(true)
    expect(asksToConfirm(field('text'), confirm, '', undefined, 'a')).toBe(true)
  })

  it('compares a chosen relation by its key', () => {
    expect(asksToConfirm(field('relation'), confirm, '7', 7, { key: '8', label: 'Eight' })).toBe(true)
    expect(asksToConfirm(field('relation'), confirm, '7', 7, { key: '7', label: 'Seven' })).toBe(false)
  })
})
