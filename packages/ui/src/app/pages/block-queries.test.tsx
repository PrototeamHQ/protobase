import { QueryClient } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@protobase/client'
import { compileReadPlan, Field, Page, RecordCard, Show, Table, type LayoutNode } from '@protobase/layout'
import { f, resource } from '@protobase/schema'
import { ApiProvider } from '../../data/api-provider'
import { MetaContext } from '../../data/meta-context'
import type { MetaData } from '../../data/meta-data'
import { blockQueries } from './block-queries'
import { ToastProvider } from '../../toasts/toast-provider'
import { Router } from '../router'
import { RenderNode } from './render-node'

const tasks = resource('tasks').table('tasks').fields({ id: f.integer().readOnly(), title: f.text(), status: f.text() }).primaryKey((r) => r.id).toModel()
const models = { tasks }
const meta = { resources: models, views: {}, permissions: {}, pages: {} } as unknown as MetaData

const planOf = (tree: LayoutNode) => compileReadPlan(tree, { models }).plan

const answer = () => Response.json({ items: [{ id: 1, title: 'Ship it', status: 'open' }], next_page_token: '', total_size_estimate: 1, total_size: 1, groups: [] })

// A fetch whose answers wait until `release`, so a read that waited for another would never start
const heldFetch = () => {
  const started: string[] = []
  const held: Array<() => void> = []
  const fetch = (url: string | URL | Request) => {
    started.push(new URL(String(url), 'http://x').pathname)
    return new Promise<Response>((resolve) => held.push(() => resolve(answer())))
  }
  return { started, fetch: fetch as typeof globalThis.fetch, release: () => held.forEach((resolve) => resolve()) }
}

const readerOf = (fetch: typeof globalThis.fetch, queryClient: QueryClient, params: Record<string, string> = {}) => ({
  client: createClient({ fetch }),
  queryClient,
  resources: meta.resources,
  views: meta.views,
  fieldTypes: undefined,
  xs: false,
  params,
})

const startPage = (tree: LayoutNode, params: Record<string, string> = {}) => {
  const held = heldFetch()
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  for (const query of blockQueries(readerOf(held.fetch, queryClient, params), tree, planOf(tree))) void query.start(queryClient)
  return held
}

describe('the queries of blocks that read by themselves', () => {
  it('starts a table under a false Show, and its chosen row before any of them answers', async () => {
    const tree = Page({
      title: 'Home',
      children: [
        Show({ when: "status = 'never'", children: Table({ resource: 'tasks', filter: 'status = {{@params.status}}', columns: ['title'], select: 'task', children: Field({ source: 'title' }) }) }),
      ],
    })
    const held = startPage(tree, { status: 'open', task: '7' })
    await vi.waitFor(() => expect(held.started).toHaveLength(2))
    expect([...held.started].sort()).toEqual(['/api/v1/tasks/7', '/api/v1/tasks:search'])
    held.release()
  })

  it('leaves a table inside the records of another to read as it draws', () => {
    const tree = Page({ title: 'Task', children: RecordCard({ resource: 'tasks', recordKey: '1', children: Table({ resource: 'tasks', filter: 'id = {{id}}', columns: ['title'] }) }) })
    expect(blockQueries(readerOf(vi.fn(), new QueryClient()), tree, planOf(tree))).toEqual([])
  })

  afterEach(() => vi.unstubAllGlobals())

  it('draws a table from the query the page started, reading nothing more', async () => {
    // The display a table last showed is remembered in the browser
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined })
    const table = Table({ resource: 'tasks', filter: "status = 'open'", columns: ['title', 'status'] })
    const tree = Page({ title: 'Home', children: table })
    const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } })
    await Promise.all(blockQueries(readerOf(async () => answer(), queryClient), tree, planOf(tree)).map((query) => query.start(queryClient)))
    const fetch = vi.fn<typeof globalThis.fetch>()
    const html = renderToStaticMarkup(
      <ApiProvider client={createClient({ fetch })} queryClient={queryClient}>
        <MetaContext.Provider value={meta}>
          <Router initialUrl="/">
            <ToastProvider>
              <RenderNode node={table} at="/children/0" />
            </ToastProvider>
          </Router>
        </MetaContext.Provider>
      </ApiProvider>,
    )
    expect(html).toContain('Ship it')
    expect(fetch).not.toHaveBeenCalled()
  })
})
