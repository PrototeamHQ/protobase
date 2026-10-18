import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Pencil } from 'lucide-react'
import { ActionMenu } from './action-menu'
import { RecordHeader } from './record-header'

describe('RecordHeader', () => {
  it("shows the record's title as the page's heading, with the status beside it", () => {
    const html = renderToStaticMarkup(createElement(RecordHeader, { title: 'Nordlicht Systemtechnik GmbH', status: { label: 'Active', tone: 'green' } }))
    expect(html).toContain('<h1 class="text-xl font-semibold tracking-tight text-foreground md:text-2xl">Nordlicht Systemtechnik GmbH</h1>')
    expect(html).toContain('Active')
    expect(html).not.toContain('sr-only')
  })
})

describe('ActionMenu', () => {
  it('is a button opening a menu of the actions, and nothing without actions', () => {
    const html = renderToStaticMarkup(createElement(ActionMenu, { actions: [{ name: 'Edit', icon: Pencil }], label: 'Record actions', className: 'size-11' }))
    expect(html).toMatch(/^<button type="button" aria-label="Record actions" aria-haspopup="menu" aria-expanded="false" class="size-11">/)
    expect(renderToStaticMarkup(createElement(ActionMenu, { actions: [] }))).toBe('')
  })
})
