import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ActivityChart } from './activity-chart'

describe('ActivityChart', () => {
  it('draws an empty chart with a zero total when the series is empty', () => {
    const html = renderToStaticMarkup(createElement(ActivityChart, { title: 'Sign-ups', noun: 'sign-ups', data: [] }))
    expect(html).toContain('<h2 class="font-semibold">Sign-ups</h2><span class="font-semibold tabular-nums">0</span>')
  })

  it('totals the series it is given', () => {
    const html = renderToStaticMarkup(createElement(ActivityChart, { title: 'Sign-ups', noun: 'sign-ups', data: [{ at: 0, count: 3 }, { at: 86_400_000, count: 4 }] }))
    expect(html).toContain('<span class="font-semibold tabular-nums">7</span>')
  })
})
