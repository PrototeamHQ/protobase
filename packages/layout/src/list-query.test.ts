import { describe, expect, it } from 'vitest'
import { filterText, referenceArrayFilter, referenceManyFilter, sortText } from './list-query'

describe('list queries', () => {
  it('reads react-admin’s sort object as the AIP-132 order it means', () => {
    expect(sortText({ field: 'claimed_at', order: 'DESC' })).toBe('claimed_at desc')
    expect(sortText({ field: 'claimed_at', order: 'ASC' })).toBe('claimed_at')
    expect(sortText('claimed_at desc')).toBe('claimed_at desc')
    expect(sortText(undefined)).toBeUndefined()
  })

  it('reads react-admin’s filter object as an AND of equalities', () => {
    expect(filterText({ status: 'open', done: false, points: 3, held_by: null })).toBe('status = "open" AND done = false AND points = 3 AND isNull(held_by)')
    expect(filterText({ title: 'say "hi" \\ bye' })).toBe('title = "say \\"hi\\" \\\\ bye"')
    expect(filterText("status = 'open' OR done = true")).toBe("status = 'open' OR done = true")
    expect(filterText({})).toBeUndefined()
  })

  it('ties a ReferenceManyField to the record’s value, keeping an OR in its filter inside it', () => {
    expect(referenceManyFilter('task_id', 7, undefined)).toBe('task_id = 7')
    expect(referenceManyFilter('task_id', 7, "status = 'open' OR done = true")).toBe("(task_id = 7) AND (status = 'open' OR done = true)")
    expect(referenceManyFilter('task_id', null, undefined)).toBeUndefined()
  })

  it('reads a ReferenceArrayField’s keys with in(), and nothing for an empty list', () => {
    expect(referenceArrayFilter('id', [3, 'a'], { active: true })).toBe('(in(id, 3, "a")) AND (active = true)')
    expect(referenceArrayFilter('id', [], undefined)).toBeUndefined()
    expect(referenceArrayFilter('id', 'not a list', undefined)).toBeUndefined()
  })
})
