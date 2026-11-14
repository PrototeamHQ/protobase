import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createClient } from '@protobase/client'
import type { LayoutChild, LayoutNode } from '@protobase/layout'
import { f, resource, view } from '@protobase/schema'
import { ApiProvider } from '../../../data/api-provider'
import { MetaContext } from '../../../data/meta-context'
import type { MetaData } from '../../../data/meta-data'
import { RecordScope } from '../record-scope'
import { RenderNode } from '../render-node'

const repairsResource = resource('repairs')
  .table('repairs')
  .fields({ id: f.integer().readOnly(), bike: f.text(), state: f.enum(['waiting', 'in_progress']), due_on: f.date(), quote: f.decimal({ precision: 10, scale: 2 }), paid: f.boolean(), manual: f.text().optional(), note: f.text().optional() })
  .primaryKey((r) => r.id)
const repairsView = view<typeof repairsResource>('repairs').fields((r) => ({ state: r.state.valueLabels({ in_progress: 'In progress' }) }))
const repairs = repairsResource.toModel()
const meta = { resources: { repairs }, views: { repairs: repairsView.toModel() } } as unknown as MetaData
const record = { id: 1, bike: 'Gazelle Tour', state: 'in_progress', due_on: '2026-02-15', quote: '1200.5', paid: true, manual: 'javascript:alert(1)', note: null }

const node = (type: string, props: LayoutNode['props'] = {}, children: LayoutChild[] = []): LayoutNode => ({ type, props, children })
const html = (element: LayoutNode) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <ApiProvider client={createClient()}>
        <MetaContext.Provider value={meta}>
          <RecordScope value={{ model: repairs, record, key: '1' }}>
            <RenderNode node={element} />
          </RecordScope>
        </MetaContext.Provider>
      </ApiProvider>
    </QueryClientProvider>,
  )

describe('field components on the web', () => {
  it('run on in the paragraph of a Text', () => {
    expect(html(node('Text', {}, ['Bike: ', node('TextField', { source: 'bike' })]))).toBe('<p>Bike: <span>Gazelle Tour</span></p>')
  })

  it('format a number and a date as react-admin does, in the reader’s locale', () => {
    expect(html(node('NumberField', { source: 'quote', options: { style: 'currency', currency: 'EUR' } }))).toBe('<span><span class="tabular-nums">€1,200.50</span></span>')
    expect(html(node('DateField', { source: 'due_on' }))).toBe('<span><time dateTime="2026-02-15">15/02/2026</time></span>')
  })

  it('show emptyText for an empty value, and nothing without it', () => {
    expect(html(node('TextField', { source: 'note', emptyText: 'none' }))).toBe('<span>none</span>')
    expect(html(node('TextField', { source: 'note' }))).toBe('')
  })

  it('draw a true boolean as the check mark tables show', () => {
    expect(html(node('BooleanField', { source: 'paid' }))).toContain('role="img" aria-label="Yes" title="Yes"')
  })

  it('draw a chip as the badge of its enum label', () => {
    expect(html(node('ChipField', { source: 'state' }))).toContain('In progress</span>')
  })

  it('show an address that could run code as text, not a link', () => {
    expect(html(node('UrlField', { source: 'manual' }))).toBe('<span>javascript:alert(1)</span>')
  })

  it('draw a Details as HTML’s, closed until opened, its summary one line', () => {
    expect(html(node('Details', {}, [node('Summary', {}, ['Repair ', node('TextField', { source: 'bike' })]), node('Text', {}, ['More'])]))).toBe(
      '<details class="[&amp;[open]&gt;summary]:mb-2"><summary class="cursor-pointer font-medium">Repair <span>Gazelle Tour</span></summary><p>More</p></details>',
    )
  })
})
