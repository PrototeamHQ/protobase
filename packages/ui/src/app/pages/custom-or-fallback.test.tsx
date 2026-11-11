import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { LayoutNode } from '@protobase/layout'
import { RenderNode } from './render-node'

// No app UI is provided here, so no component is registered and every custom element falls back
const custom = (fallback?: LayoutNode['fallback']): LayoutNode => ({ type: 'UsageChart', props: {}, children: [], custom: true, ...(fallback && { fallback }) })
const alert = /<div role="alert"[^>]*>No component is registered as UsageChart\./

describe('a custom element the app cannot draw', () => {
  it('draws its fallback, under the warning in development', () => {
    const html = renderToStaticMarkup(<RenderNode node={custom(['Open the chart on the web'])} />)
    expect(html).toMatch(alert)
    expect(html).toContain('<p class="leading-6">Open the chart on the web</p>')
  })

  it('draws only the warning with an empty fallback, in development', () => {
    expect(renderToStaticMarkup(<RenderNode node={custom([])} />)).toMatch(new RegExp(`^${alert.source}[^<]*</div>$`))
  })

  it('draws the warning without a fallback', () => {
    expect(renderToStaticMarkup(<RenderNode node={custom()} />)).toMatch(alert)
  })
})
