import { describe, expect, it } from 'vitest'
import { fieldRef, fieldRefsIn, isFieldRef, markFieldRefs, unmarkFieldRefs } from './field-ref'
import { ref } from './refs'

describe('field references', () => {
  it('marks every r.field in props, at any depth, and leaves plain data alone', () => {
    const marked = markFieldRefs({ by: ref('status'), columns: [ref('title'), 'note'], size: 3, look: { name: 'wide' } })
    expect(marked).toEqual({ by: { $field: 'status' }, columns: [{ $field: 'title' }, 'note'], size: 3, look: { name: 'wide' } })
    expect(fieldRefsIn(marked)).toEqual(['status', 'title'])
  })

  it('gives a component its props with field names in place of the references', () => {
    expect(unmarkFieldRefs({ field: fieldRef('plan.name'), list: [fieldRef('total'), 2], label: 'Plan' })).toEqual({ field: 'plan.name', list: ['total', 2], label: 'Plan' })
  })

  it('tells a reference from an object that only looks like one', () => {
    expect([isFieldRef({ $field: 'a' }), isFieldRef({ $field: 'a', label: 'b' }), isFieldRef({ name: 'a' }), isFieldRef(['a'])]).toEqual([true, false, false, false])
  })
})
