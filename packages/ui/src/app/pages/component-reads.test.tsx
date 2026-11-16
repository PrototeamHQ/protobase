import { QueryClient } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { createClient } from '@protobase/client'
import { compileReadPlan, component, Page, type LayoutNode } from '@protobase/layout'
import { f, resource } from '@protobase/schema'
import { ApiProvider } from '../../data/api-provider'
import { MetaContext } from '../../data/meta-context'
import type { MetaData } from '../../data/meta-data'
import { useComponentReads } from './component-reads'
import { planQueries } from './plan-queries'
import { PlanReadsProvider } from './plan-reads'
import { ProjectUiContext } from './project-ui'
import { RecordScope } from './record-scope'
import { RenderNode } from './render-node'

const tasks = resource('tasks').table('tasks').fields({ id: f.integer().readOnly(), title: f.text() }).primaryKey((r) => r.id).toModel()
const links = resource('links').table('links').fields({ id: f.integer().readOnly(), from_id: f.integer(), to_id: f.integer() }).primaryKey((r) => r.id).toModel()
const models = { tasks, links }
const meta = { resources: models, views: {} } as unknown as MetaData

const Network = component<{ nodes: string; edges: string; label: string }>('Network', { reads: [{ resource: 'nodes', fields: 'label' }, { resource: 'edges' }] })

// Draws what each of its reads holds, as a plugin's component only draws
const DrawnGraph = () => {
  const reads = useComponentReads()
  return <p>{Object.entries(reads).map(([name, read]) => `${name}:${read.model.name}:${read.rows.length}`).join(' ')}</p>
}

const tree = Page({ title: 'Map', children: Network({ nodes: 'tasks', edges: 'links', label: 'title' }) })

describe("a custom component's declared reads", () => {
  it('reach it from the page’s plan, the page reading each of them, and it reads nothing itself', () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
    const client = createClient({ fetch })
    const queryClient = new QueryClient()
    const plan = compileReadPlan(tree, { models }).plan
    const started = planQueries({ client, queryClient, resources: meta.resources, views: meta.views, fieldTypes: undefined, xs: false, params: {} }, tree, plan)
    expect(started.map(({ read }) => [read.part, read.resource])).toEqual([['nodes', 'tasks'], ['edges', 'links']])
    for (const { read, queryKey } of started) queryClient.setQueryData(queryKey, { rows: read.resource === 'tasks' ? [{ id: 1 }, { id: 2 }] : [{ id: 7 }] })
    const html = renderToStaticMarkup(
      <ApiProvider client={client} queryClient={queryClient}>
        <MetaContext.Provider value={meta}>
          <ProjectUiContext.Provider value={{ components: { Network: DrawnGraph } }}>
            <PlanReadsProvider tree={tree} plan={plan}>
              <RenderNode node={tree.children[0] as LayoutNode} at="/children/0" />
            </PlanReadsProvider>
          </ProjectUiContext.Provider>
        </MetaContext.Provider>
      </ApiProvider>,
    )
    expect(html).toContain('nodes:tasks:2 edges:links:1')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('read by itself where the page plans none, with the record around it filled into its filter', () => {
    const Links = component<{ edges: string; filter: string }>('Links', { reads: { resource: 'edges', filter: 'filter' } })
    const client = createClient({ fetch: vi.fn<typeof globalThis.fetch>() })
    const queryClient = new QueryClient()
    const DrawnLinks = () => {
      useComponentReads()
      return null
    }
    renderToStaticMarkup(
      <ApiProvider client={client} queryClient={queryClient}>
        <MetaContext.Provider value={meta}>
          <ProjectUiContext.Provider value={{ components: { Links: DrawnLinks } }}>
            <RecordScope value={{ model: tasks, record: { id: 7 }, key: '7' }}>
              <RenderNode node={Links({ edges: 'links', filter: 'from_id = {{this.id}}' })} />
            </RecordScope>
          </ProjectUiContext.Provider>
        </MetaContext.Provider>
      </ApiProvider>,
    )
    const read = queryClient.getQueryCache().getAll().map((query) => JSON.stringify(query.queryKey))
    expect(read.filter((key) => key.includes('from_id = 7'))).toHaveLength(1)
    expect(read.filter((key) => key.includes('{{'))).toEqual([])
  })
})
