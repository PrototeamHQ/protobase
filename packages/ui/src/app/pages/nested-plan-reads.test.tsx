import { QueriesObserver, QueryClient } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@protobase/client'
import { CardRow, compileReadPlan, Field, Page, planReadId, RecordCards, Table, Thread } from '@protobase/layout'
import { f, resource } from '@protobase/schema'
import { ApiProvider } from '../../data/api-provider'
import { MetaContext } from '../../data/meta-context'
import type { MetaData } from '../../data/meta-data'
import { ToastProvider } from '../../toasts/toast-provider'
import { Router } from '../router'
import { blockQueries } from './block-queries'
import { PageParamsProvider } from './page-params'
import { planQueries } from './plan-queries'
import { PlanReadsProvider } from './plan-reads'
import { orderOf } from './nested-plan-reads'
import { RenderNode } from './render-node'

const tasks = resource('tasks').table('tasks').fields({ id: f.integer().readOnly(), title: f.text(), status: f.text() }).primaryKey((r) => r.id).toModel()
const people = resource('people').table('people').fields({ id: f.integer().readOnly(), name: f.text() }).primaryKey((r) => r.id).toModel()
const claims = resource('task_claims')
  .table('task_claims')
  .fields({ id: f.integer().readOnly().sortable(), task_id: f.relation('tasks').filterable(), owner_id: f.relation('people'), status: f.text() })
  .primaryKey((r) => r.id)
  .toModel()
const models = { tasks, people, task_claims: claims }
const meta = { resources: models, views: {}, permissions: {}, pages: {} } as unknown as MetaData

// Open tasks in a row of cards, each with a table of its claims naming their owners, its claims as cards, and a thread of them
const ofTask = 'task_id = {{id}}'
const tree = Page({
  title: 'Tasks',
  children: CardRow({
    resource: 'tasks',
    filter: "status = 'open'",
    limit: 10,
    children: [
      Field({ source: 'title', label: false }),
      Table({ resource: 'task_claims', filter: ofTask, columns: ['owner_id', 'status'], limit: 1 }),
      RecordCards({ resource: 'task_claims', filter: ofTask, limit: 1 }),
      Thread({ resource: 'task_claims', filter: ofTask, sender: 'owner_id', time: 'id', text: 'status', limit: 2 }),
    ],
  }),
})
const plan = compileReadPlan(tree, { models }).plan

const readerOf = (client: ReturnType<typeof createClient>, queryClient: QueryClient) => ({ client, queryClient, resources: meta.resources, views: meta.views, fieldTypes: undefined, xs: false, params: {} })

// A fetch whose answers wait until `release`, so a read that waited for another would never start
const heldFetch = () => {
  const started: string[] = []
  const held: Array<() => void> = []
  const fetch = (url: string | URL | Request) => {
    started.push(new URL(String(url), 'http://x').pathname)
    return new Promise<Response>((resolve) => held.push(() => resolve(Response.json({ items: [], next_page_token: '', total_size_estimate: 0, groups: [] }))))
  }
  return { started, fetch: fetch as typeof globalThis.fetch, release: () => held.forEach((resolve) => resolve()) }
}

// What each planned read answered, by `planReadId`: two tasks, each with claims, task 1's 37 in all
const claimRows = [
  { id: 11, task_id: 1, owner_id: 5, status: 'done' },
  { id: 13, task_id: 2, owner_id: 6, status: 'later' },
]
const answers: Record<string, unknown> = {
  '/children/0': { rows: [{ id: 1, title: 'Ship it' }, { id: 2, title: 'Test it' }] },
  '/children/0/children/1': { rows: claimRows, labels: { owner_id: { 5: 'Ada', 6: 'Grace' } } },
  '/children/0/children/1#total': { rows: [{ value: 1, count: 37 }, { value: 2, count: 1 }] },
  '/children/0/children/2': { rows: claimRows },
  '/children/0/children/2#total': { rows: [{ value: 1, count: 37 }, { value: 2, count: 1 }] },
  '/children/0/children/3': { rows: claimRows, labels: { owner_id: { 5: 'Ada', 6: 'Grace' } } },
}

describe('a Table, RecordCards and Thread inside the records of another block', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('start their reads and totals with the page, before any read answers, and none as they draw', async () => {
    const held = heldFetch()
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const queries = planQueries(readerOf(createClient({ fetch: held.fetch }), queryClient), tree, plan)
    new QueriesObserver(queryClient, queries.map(({ queryKey, queryFn }) => ({ queryKey, queryFn }))).subscribe(() => {})
    await vi.waitFor(() => expect(held.started).toHaveLength(6))
    expect(held.started.sort()).toEqual(['/api/v1/task_claims', '/api/v1/task_claims', '/api/v1/task_claims', '/api/v1/task_claims:aggregate', '/api/v1/task_claims:aggregate', '/api/v1/tasks'])
    expect(blockQueries({ ...readerOf(createClient({ fetch: held.fetch }), queryClient), given: {} }, tree, plan)).toEqual([])
    held.release()
  })

  it('ask for the names of a table’s relations and a thread’s senders, in the order the block shows', () => {
    const reads = planQueries(readerOf(createClient({ fetch: vi.fn() }), new QueryClient()), tree, plan)
    const table = reads.find(({ read }) => planReadId(read) === '/children/0/children/1')!
    expect(table.read).toMatchObject({ orderBy: 'id asc', limitPer: { field: 'task_id', count: 1 } })
    expect(table.queryKey.at(-1)).toMatchObject({ labels: { owner_id: 'name' } })
    expect(reads.find(({ read }) => planReadId(read) === '/children/0/children/3')!.queryKey.at(-1)).toEqual({ labels: { owner_id: 'name' } })
  })

  it('draw each record’s rows, their owners’ names and total from the page’s reads, reading nothing themselves', () => {
    // The display a table last showed is remembered in the browser
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined })
    const fetch = vi.fn<typeof globalThis.fetch>()
    const client = createClient({ fetch })
    const queryClient = new QueryClient()
    for (const { read, queryKey } of planQueries(readerOf(client, queryClient), tree, plan)) queryClient.setQueryData(queryKey, answers[planReadId(read)])
    const html = renderToStaticMarkup(
      <ApiProvider client={client} queryClient={queryClient}>
        <MetaContext.Provider value={meta}>
          <Router initialUrl="/">
            <PageParamsProvider page="tasks" tree={tree}>
              <ToastProvider>
                <PlanReadsProvider tree={tree} plan={plan}>
                  <RenderNode node={tree} at="" />
                </PlanReadsProvider>
              </ToastProvider>
            </PageParamsProvider>
          </Router>
        </MetaContext.Provider>
      </ApiProvider>,
    )
    const [first, second] = html.split('Test it')
    expect(first).toContain('Ada')
    expect(first).toContain('The first 1 of 37.')
    expect(first).not.toContain('Grace')
    expect(second).toContain('Grace')
    expect(second).not.toContain('The first')
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('orderOf', () => {
  const read = { block: '/children/0', kind: 'list' as const, resource: 'task_claims', etag: false }
  it('takes the read’s order over the view’s', () => expect(orderOf({ ...read, orderBy: 'id desc' }, 'id asc')).toBe('id desc'))
  it('takes the view’s order when the read’s is empty or absent', () => {
    expect(orderOf({ ...read, orderBy: '' }, 'id asc')).toBe('id asc')
    expect(orderOf(read, 'id asc')).toBe('id asc')
  })
  it('has none when both are empty or absent', () => {
    expect(orderOf({ ...read, orderBy: '' }, '')).toBeUndefined()
    expect(orderOf(read, undefined)).toBeUndefined()
  })
})
