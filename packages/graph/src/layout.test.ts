import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { checkPages, compileReadPlan, Field, Image, page, Page } from '@protobase/layout'
import { Graph, graph } from './layout'
import { models, sampleFields } from './testing/sample-graph'

const map = (props = {}, children?: ReturnType<typeof Field>) => Page({ title: 'Map', children: Graph({ nodes: 'services', edges: 'links', ...sampleFields, ...props, ...(children && { children }) }) })

describe('the Graph block', () => {
  it('has the page’s plan read its nodes and its edges at page load, each with the fields it draws', () => {
    const { plan, problems } = compileReadPlan(map(), { models })
    expect(problems).toEqual([])
    expect(plan.reads).toEqual([
      { block: '/children/0', part: 'nodes', kind: 'list', resource: 'services', pageSize: 500, fields: ['area', 'health', 'id', 'name'], etag: false },
      { block: '/children/0', part: 'edges', kind: 'list', resource: 'links', pageSize: 500, fields: ['from_id', 'id', 'to_id'], etag: false },
    ])
    expect(plan.outside).toEqual([])
  })

  it('reads the node its select chose by the key the address holds, its children in that node', () => {
    const { plan } = compileReadPlan(map({ select: 'service' }, Field({ source: 'health' })), { models })
    expect(plan.reads.find((read) => read.part === 'chosen')).toEqual({ block: '/children/0', part: 'chosen', kind: 'list', resource: 'services', filter: 'id = {{@params.service}}', pageSize: 1, fields: ['health', 'id'], etag: false })
    expect(() => page('map', map({ select: 'service' }))).not.toThrow()
    expect(() => page('map', map({ select: 'two words' }))).toThrow('<Page> › <Graph source="from_id">: "select" names a page parameter, such as window, and "two words" is none')
  })

  it('names a field the nodes or edges do not have', () => {
    const input = { models, actions: () => new Set<string>() }
    expect(() => checkPages([{ name: 'map', title: 'Map', tree: map({ status: 'state' }) }], input)).toThrow('<Page> › <Graph source="from_id">: "status" names no field of services: "state"')
  })

  it('carries the fallback an app declares it with, such as an image of the same graph', () => {
    const Pictured = graph({ fallback: Image({ function: 'service_map' }) })
    expect(Pictured({ nodes: 'services', edges: 'links', ...sampleFields }).fallback).toEqual([{ type: 'Image', props: { function: 'service_map' }, children: [] }])
    expect(Graph({ nodes: 'services', edges: 'links', ...sampleFields })).not.toHaveProperty('fallback')
  })
})

// The modules a file imports by a relative path, and everything they import in turn
const importsOf = (file: URL, seen = new Set<string>()): Set<string> => {
  const source = readFileSync(file, 'utf8')
  for (const [, name] of source.matchAll(/from '([^']+)'/g)) {
    if (!name!.startsWith('.')) {
      seen.add(name!)
      continue
    }
    const next = new URL(`${name}.ts`, file)
    if (seen.has(next.href)) continue
    seen.add(next.href)
    importsOf(next, seen)
  }
  return seen
}

describe('what an app carries', () => {
  it('keeps the drawing library out of the layout entry an app’s config imports', () => {
    const imported = [...importsOf(new URL('./layout.ts', import.meta.url))].filter((name) => !name.startsWith('file:'))
    expect(imported.sort()).toEqual(['@protobase/layout'])
  })

  // The app's shell has its own copy of the drawing library for the workflow editor, which plugins do not share
  it('keeps the graph’s layout library out of the packages every app carries, and the drawing library out of its config', () => {
    const dependencies = (name: string) => {
      const manifest = JSON.parse(readFileSync(new URL(`../../${name}/package.json`, import.meta.url), 'utf8')) as Record<string, Record<string, string> | undefined>
      return Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies, ...manifest.optionalDependencies })
    }
    for (const name of ['ui', 'layout', 'schema']) expect(dependencies(name).filter((dependency) => dependency.startsWith('@dagrejs/'))).toEqual([])
    for (const name of ['layout', 'schema']) expect(dependencies(name).filter((dependency) => dependency.startsWith('@xyflow/'))).toEqual([])
  })
})
