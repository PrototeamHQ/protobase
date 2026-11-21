import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FacetCombobox } from './facet-combobox'
import { FacetGroup } from './facet-group'

const config = { id: 'kind', label: 'Kind', options: [] }

describe('FacetGroup', () => {
  it('says its counts could not be loaded rather than that nothing matches', () => {
    const html = renderToStaticMarkup(createElement(FacetGroup, { config: { ...config, failed: true }, selected: [], onToggle: () => {} }))
    expect(html).toContain('Could not load the counts')
    expect(html).not.toContain('No matches')
  })

  it('says nothing matches when the counts loaded empty', () => {
    expect(renderToStaticMarkup(createElement(FacetGroup, { config, selected: [], onToggle: () => {} }))).toContain('No matches')
  })

  it('says so in a combobox too', () => {
    const html = renderToStaticMarkup(createElement(FacetCombobox, { config: { ...config, combobox: true, failed: true }, selected: [], onToggle: () => {}, inline: true }))
    expect(html).toContain('Could not load the counts')
  })
})
