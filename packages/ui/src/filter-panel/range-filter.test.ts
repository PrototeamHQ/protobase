import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { RangeFilter } from './range-filter'

describe('RangeFilter', () => {
  it('says its bounds could not be loaded instead of drawing a slider', () => {
    const config = { id: 'price', label: 'Price', min: 0, max: 0, step: 1, histogram: [], format: String, failed: true }
    const html = renderToStaticMarkup(createElement(RangeFilter, { config, onChange: () => {} }))
    expect(html).toContain('Could not load the counts')
    expect(html).not.toContain('type="range"')
  })
})
