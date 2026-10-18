import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ColumnSpec } from './column-spec'
import { GridHeader } from './grid-header'

const name: ColumnSpec = { id: 'name', header: 'Name', kind: 'text', width: 200, sortable: true }
const city: ColumnSpec = { id: 'city', header: 'City', kind: 'text', width: 120 }

const render = () =>
  renderToStaticMarkup(
    createElement(GridHeader, {
      cells: [name, city].map((spec) => ({ spec, sorted: false as const, onSort: () => {} })),
      specs: [name, city],
      gutter: 40,
      selectedCount: 0,
      selectable: false,
      onTogglePin: () => {},
      onClearSelection: () => {},
    }),
  )

describe('GridHeader', () => {
  it('makes a sortable header a button, and says on an unsortable one that it cannot be sorted', () => {
    const html = render()
    expect(html).toMatch(/<button type="button" class="[^"]*"><span class="truncate">Name<\/span>/)
    expect(html).toContain(`<div title="This column can&#x27;t be sorted" class="`)
    expect(html).not.toMatch(/<button[^>]*disabled[^>]*><span class="truncate">City/)
  })
})
