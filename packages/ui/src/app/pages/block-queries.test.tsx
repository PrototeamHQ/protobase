import { QueryClient } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@protobase/client'
import { Chart, compileReadPlan, Field, Match, Page, RecordCard, RecordCards, RecordRow, Show, Switch, Table, Thread, type LayoutNode } from '@protobase/layout'
import { f, resource } from '@protobase/schema'
import { ApiProvider } from '../../data/api-provider'
import { MetaContext } from '../../data/meta-context'
import type { MetaData } from '../../data/meta-data'
import { blockQueries } from './block-queries'
import { ToastProvider } from '../../toasts/toast-provider'
import { Router } from '../router'
import { RenderNode } from './render-node'
import { PageParamsProvider } from './page-params'

const tasks = resource('tasks').table('tasks').fields({ id: f.integer().readOnly(), title: f.text(), status: f.text() }).primaryKey((r) => r.id).toModel()
const models = { tasks }
const meta = { resources: models, views: {}, permissions: {}, pages: {} } as unknown as MetaData

const planOf = (tree: LayoutNode) => compileReadPlan(tree, { models }).plan

// A record by its key, or a list
const answer = (url: string | URL | Request = '/api/v1/tasks') =>
  new URL(String(url), 'http://x').pathname === '/api/v1/tasks/7' ? Response.json({ id: 7, title: 'Chosen one', status: 'open' }) : Response.json({ items: [{ id: 1, title: 'Ship it', status: 'open' }], next_page_token: '', total_size_estimate: 1, total_size: 1, groups: [] })

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

const readerOf = (fetch: typeof globalThis.fetch, queryClient: QueryClient, params: Record<string, string> = {}, given: Record<string, string> = {}) => ({
  client: createClient({ fetch }),
  queryClient,
  resources: meta.resources,
  views: meta.views,
  fieldTypes: undefined,
  xs: false,
  params,
  given,
})

const startPage = (tree: LayoutNode, params: Record<string, string> = {}, given: Record<string, string> = {}) => {
  const held = heldFetch()
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  for (const query of blockQueries(readerOf(held.fetch, queryClient, params, given), tree, planOf(tree))) void query.start(queryClient)
  return held
}

describe('the queries of blocks that read by themselves', () => {
  it('starts a table under a false Show, its chosen row, a chart under an unmatched Match and a condition’s count before any of them answers', async () => {
    const tree = Page({
      title: 'Home',
      children: [
        Show({ when: 'tasks.count > 0', children: Field({ source: 'title' }) }),
        Switch({ children: Match({ when: "status = 'never'", children: Chart({ resource: 'tasks', groupBy: 'status' }) }) }),
        Show({ when: "status = 'never'", children: Table({ resource: 'tasks', filter: 'status = {{@params.status}}', columns: ['title'], select: 'task', children: Field({ source: 'title' }) }) }),
      ],
    })
    const held = startPage(tree, { status: 'open' }, { status: 'open', task: '7' })
    await vi.waitFor(() => expect(held.started).toHaveLength(4))
    expect([...held.started].sort()).toEqual(['/api/v1/tasks', '/api/v1/tasks/7', '/api/v1/tasks:aggregate', '/api/v1/tasks:search'])
    held.release()
  })

  it('starts a list of record cards with the count of its records', async () => {
    const held = startPage(Page({ title: 'Home', children: RecordCards({ resource: 'tasks', filter: "status = 'open'", limit: 3 }) }))
    await vi.waitFor(() => expect(held.started).toEqual(['/api/v1/tasks', '/api/v1/tasks']))
    held.release()
  })

  it('starts a record row’s first page under a false Show', async () => {
    const held = startPage(Page({ title: 'Home', children: Show({ when: "status = 'never'", children: RecordRow({ resource: 'tasks', filter: "status = 'open'" }) }) }))
    await vi.waitFor(() => expect(held.started).toEqual(['/api/v1/tasks']))
    held.release()
  })

  it('starts a thread’s messages and its tool calls', async () => {
    const calls = { resource: 'tasks', name: 'title', time: 'id', status: 'status' }
    const held = startPage(Page({ title: 'Chat', children: Thread({ resource: 'tasks', sender: 'status', time: 'id', text: 'title', calls }) }))
    await vi.waitFor(() => expect(held.started).toEqual(['/api/v1/tasks', '/api/v1/tasks']))
    held.release()
  })

  it('leaves a table inside the records of another to read as it draws', () => {
    const tree = Page({ title: 'Task', children: RecordCard({ resource: 'tasks', recordKey: '1', children: Table({ resource: 'tasks', filter: 'id = {{id}}', columns: ['title'] }) }) })
    expect(blockQueries(readerOf(vi.fn(), new QueryClient()), tree, planOf(tree))).toEqual([])
  })

  afterEach(() => vi.unstubAllGlobals())

  // The block drawn once the queries the page started for it answered, and what it fetched itself
  const drawnAfterStart = async (block: LayoutNode, given: Record<string, string> = {}) => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } })
    const tree = Page({ title: 'Home', children: block })
    // The page's parameters hold only its SelectInputs' values, so a `select`'s key is in its address alone
    const started = vi.fn(async (url: string | URL | Request) => answer(url))
    await Promise.all(blockQueries(readerOf(started, queryClient, {}, given), tree, planOf(tree)).map((query) => query.start(queryClient)))
    const fetch = vi.fn<typeof globalThis.fetch>()
    const html = renderToStaticMarkup(
      <ApiProvider client={createClient({ fetch })} queryClient={queryClient}>
        <MetaContext.Provider value={meta}>
          <Router initialUrl="/">
            <PageParamsProvider page="home" tree={tree} given={given}>
              <ToastProvider>
                <RenderNode node={block} at="/children/0" />
              </ToastProvider>
            </PageParamsProvider>
          </Router>
        </MetaContext.Provider>
      </ApiProvider>,
    )
    return { html, fetch, started: started.mock.calls.map(([url]) => new URL(String(url), 'http://x').pathname) }
  }

  it('draws a table from the query the page started, reading nothing more', async () => {
    // The display a table last showed is remembered in the browser
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined })
    const { html, fetch } = await drawnAfterStart(Table({ resource: 'tasks', filter: "status = 'open'", columns: ['title', 'status'] }))
    expect(html).toContain('Ship it')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('draws a table’s chosen row from the query the page started with the key its address holds, reading nothing more', async () => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined })
    const { html, fetch, started } = await drawnAfterStart(Table({ resource: 'tasks', columns: ['title'], select: 'task', children: Field({ source: 'title' }) }), { task: '7' })
    expect(html).toContain('Chosen one')
    expect(started.filter((path) => path === '/api/v1/tasks/7')).toHaveLength(1)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('draws a record row from the page the page started, reading nothing more', async () => {
    const { html, fetch } = await drawnAfterStart(RecordRow({ resource: 'tasks', filter: "status = 'open'" }))
    // Its count is the first page's total; its cards are drawn from that page's rows once it mounts
    expect(html).toContain('>1 tasks<')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('draws a thread from the pages the page started, reading nothing more', async () => {
    const { html, fetch } = await drawnAfterStart(Thread({ resource: 'tasks', sender: 'status', time: 'id', text: 'title' }))
    expect(html).toContain('Ship it')
    expect(fetch).not.toHaveBeenCalled()
  })
})
