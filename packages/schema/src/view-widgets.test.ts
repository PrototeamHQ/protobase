import { describe, expect, it } from 'vitest'
import { ref } from './refs'
import { widgets as w } from './view-widgets'

describe('widgets', () => {
  it('leave secondary out unless asked', () => {
    expect('secondary' in w.facets(ref('status'))).toBe(false)
  })

  it('carry secondary: true on every kind that is asked', () => {
    const secondary = [
      w.range(ref('price'), { secondary: true }),
      w.facets(ref('status'), { secondary: true }),
      w.dateRange(ref('created'), { secondary: true }),
      w.toggle(ref('garden'), { secondary: true }),
      w.flags([ref('for_sale'), ref('for_rent')] as never, { label: 'Offer', secondary: true }),
    ]
    expect(secondary.map((widget) => widget.secondary)).toEqual([true, true, true, true, true])
  })
})
