import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createClient } from '@protobase/client'
import type { LayoutNode } from '@protobase/layout'
import { f, resource } from '@protobase/schema'
import { ApiProvider } from '../../../data/api-provider'
import { MetaContext } from '../../../data/meta-context'
import type { MetaData } from '../../../data/meta-data'
import { RecordScope } from '../record-scope'
import { RenderNode } from '../render-node'

const changes = resource('changes')
  .table('changes')
  .fields({ id: f.integer().readOnly(), patch: f.text().optional() })
  .primaryKey((r) => r.id)
  .toModel()
const meta = { resources: { changes }, views: {} } as unknown as MetaData

const html = (patch: string | null, props: LayoutNode['props'] = {}) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <ApiProvider client={createClient()}>
        <MetaContext.Provider value={meta}>
          <RecordScope value={{ model: changes, record: { id: 1, patch }, key: '1' }}>
            <RenderNode node={{ type: 'Diff', props: { source: 'patch', ...props }, children: [] }} />
          </RecordScope>
        </MetaContext.Provider>
      </ApiProvider>
    </QueryClientProvider>,
  )

const twoFiles = '--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-one\n+two\n--- a/b.ts\n+++ b/b.ts\n@@ -4 +4 @@\n-three\n+four\n'

describe('Diff on the web', () => {
  it('draws each file of the patch under its name', () => {
    const drawn = html(twoFiles)
    expect(drawn).toContain('a.ts</span>')
    expect(drawn).toContain('b.ts</span>')
    expect(drawn.match(/md:hidden/g)).toHaveLength(2)
  })

  it('shows text that is no patch as it is', () => {
    expect(html('Ship <it>')).toMatch(/^<pre [^>]*>Ship &lt;it&gt;<\/pre>$/)
  })

  it('shows emptyText for an empty field, and nothing without it', () => {
    expect(html(null, { emptyText: 'No changes' })).toMatch(/^<p [^>]*>No changes<\/p>$/)
    expect(html('')).toBe('')
  })
})
