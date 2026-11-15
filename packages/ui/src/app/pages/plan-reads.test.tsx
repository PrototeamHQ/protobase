import { QueriesObserver, QueryClient } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { createClient } from '@protobase/client'
import { CardRow, compileReadPlan, Field, Match, Page, RecordCard, RecordsIterator, ReferenceManyField, Show, Stat, Switch, type LayoutNode } from '@protobase/layout'
import { f, resource } from '@protobase/schema'
import { ApiProvider } from '../../data/api-provider'
import { MetaContext } from '../../data/meta-context'
import type { MetaData } from '../../data/meta-data'
import { planQueries } from './plan-queries'
import { PlanReadsProvider } from './plan-reads'
import { RenderNode } from './render-node'

const tasks = resource('tasks').table('tasks').fields({ id: f.integer().readOnly(), title: f.text(), status: f.text() }).primaryKey((r) => r.id).toModel()
const taskClaims = resource('task_claims').table('task_claims').fields({ id: f.integer().readOnly(), task_id: f.integer(), status: f.text() }).primaryKey((r) => r.id).toModel()
const claimSteps = resource('claim_steps').table('claim_steps').fields({ id: f.integer().readOnly(), claim_id: f.integer(), name: f.text() }).primaryKey((r) => r.id).toModel()
const models = { tasks, task_claims: taskClaims, claim_steps: claimSteps }
const meta = { resources: models, views: {} } as unknown as MetaData

// Open tasks in a row of cards, each with its claims, and the claims' steps under each claim
const steps = ReferenceManyField({ reference: 'claim_steps', target: 'claim_id', empty: 'No steps', children: RecordsIterator({ children: Field({ source: 'name', label: false }) }) })
const claims = ReferenceManyField({ reference: 'task_claims', target: 'task_id', perPage: 5, empty: 'No claims', children: RecordsIterator({ children: [Field({ source: 'status', label: false }), steps] }) })
const twoLevels = Page({ title: 'Tasks', children: CardRow({ resource: 'tasks', filter: "status = 'open'", limit: 10, children: [Field({ source: 'title', label: false }), claims] }) })

const planOf = (tree: LayoutNode) => compileReadPlan(tree, { models }).plan

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

const startPage = (tree: LayoutNode) => {
  const held = heldFetch()
  const queries = planQueries(createClient({ fetch: held.fetch }), tree, planOf(tree), {})
  new QueriesObserver(new QueryClient({ defaultOptions: { queries: { retry: false } } }), queries.map(({ queryKey, queryFn }) => ({ queryKey, queryFn }))).subscribe(() => {})
  return held
}

describe('a page’s planned reads on the web', () => {
  it('starts every read of a two-level page before any of them answers', async () => {
    const held = startPage(twoLevels)
    await vi.waitFor(() => expect(held.started).toHaveLength(3))
    expect(held.started).toEqual(['/api/v1/tasks', '/api/v1/task_claims', '/api/v1/claim_steps'])
    held.release()
  })

  it('starts the reads under a false Show and an unmatched Match in the same wave', async () => {
    const tree = Page({
      title: 'Home',
      children: [
        twoLevels.children[0] as LayoutNode,
        Show({ when: "status = 'never'", children: RecordCard({ resource: 'tasks', recordKey: '1', children: Field({ source: 'title' }) }) }),
        Switch({ children: Match({ when: "status = 'never'", children: Stat({ label: 'Claims', resource: 'task_claims' }) }) }),
      ],
    })
    const held = startPage(tree)
    await vi.waitFor(() => expect(held.started).toHaveLength(5))
    expect(held.started.slice(3)).toEqual(['/api/v1/tasks', '/api/v1/task_claims'])
    held.release()
  })

  it('draws each nested row under its own record, from its read alone, and a record with none as empty', () => {
    const rows: Record<string, Record<string, unknown>[]> = {
      tasks: [{ id: 1, title: 'Ship it' }, { id: 2, title: 'Test it' }],
      task_claims: [{ id: 11, task_id: 1, status: 'done' }, { id: 12, task_id: 1, status: 'open' }],
      claim_steps: [{ id: 21, claim_id: 11, name: 'plan' }, { id: 22, claim_id: 11, name: 'build' }],
    }
    const fetch = vi.fn<typeof globalThis.fetch>()
    const client = createClient({ fetch })
    const queryClient = new QueryClient()
    const plan = planOf(twoLevels)
    for (const { read, queryKey } of planQueries(client, twoLevels, plan, {})) queryClient.setQueryData(queryKey, { rows: rows[read.resource] })
    const html = renderToStaticMarkup(
      <ApiProvider client={client} queryClient={queryClient}>
        <MetaContext.Provider value={meta}>
          <PlanReadsProvider tree={twoLevels} plan={plan}>
            <RenderNode node={twoLevels} at="" />
          </PlanReadsProvider>
        </MetaContext.Provider>
      </ApiProvider>,
    )
    const shown = html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter((word) => /^(Ship|Test|done|open|plan|build|No)$/.test(word))
    expect(shown).toEqual(['Ship', 'done', 'plan', 'build', 'open', 'No', 'Test', 'No'])
    expect(fetch).not.toHaveBeenCalled()
  })
})
