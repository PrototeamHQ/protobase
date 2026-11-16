/** @jsxImportSource @protobase/layout */
import { describe, expect, it } from 'vitest'
import { CardRow, Field, Graph, Image, Page, Show, Table } from './blocks'
import { SelectInput } from './page-params'
import { treeFindings } from './check-page'
import { component } from './component'
import { structureProblems } from './check-structure'
import { compileReadPlan } from './compile-read-plan'
import { Text } from './elements'
import { pruneTree, type CallerAccess } from './prune-page'
import { pageText } from './text/page-text'
import { field, model } from './testing/models'
import { linkRows, serviceRows } from './testing/sample-graph'
import { layout, recordLayout } from './typed/layout'

const services = model('services', [
  field('id', 'integer', { readOnly: true }),
  field('name', 'text'),
  field('owner', 'text'),
  field('area', 'enum', { enumValues: ['edge', 'core', 'data'] }),
  field('health', 'enum', { enumValues: ['up', 'degraded', 'down'] }),
  field('map_x', 'integer'),
  field('map_y', 'integer'),
])
const links = model('links', [
  field('id', 'integer', { readOnly: true }),
  field('from_id', 'integer'),
  field('to_id', 'integer'),
  field('protocol', 'text'),
  field('state', 'enum', { enumValues: ['idle', 'busy', 'broken'] }),
  field('optional', 'boolean'),
])
const models = { services, links }

const base = { nodes: 'services', edges: 'links', source: 'from_id', target: 'to_id', label: 'name' } as const

const problemsOf = (graph: ReturnType<typeof Graph>) => treeFindings(Page({ title: 'Map', children: graph }), { models, actions: () => new Set() }).problems

describe('a Graph', () => {
  it("builds a node's contents from a function of its record into one template, and each edge condition from an arrow", () => {
    const tree = layout(() => (
      <Graph
        {...base}
        group="area"
        status="health"
        node={(service) => (
          <>
            <Text as="strong">{service.name}</Text>
            <Show when={service.health.eq('down')}>
              <Text>{`Owned by ${service.owner}`}</Text>
            </Show>
          </>
        )}
        animated={(link) => link.state.eq('busy')}
        dashed={(link) => link.optional.eq(true)}
        fallback={<Image function="service_map" />}
      />
    ))
    expect(tree.props.node).toEqual({
      type: 'Box',
      props: {},
      children: [
        { type: 'Text', props: { as: 'strong' }, children: ['{{name}}'] },
        { type: 'Show', props: { when: 'health = "down"' }, children: [{ type: 'Text', props: {}, children: ['Owned by {{owner}}'] }] },
      ],
    })
    expect(tree.props).toMatchObject({ animated: 'state = "busy"', dashed: 'optional = true' })
    expect(tree.fallback).toEqual([{ type: 'Image', props: { function: 'service_map' }, children: [] }])
    expect(tree.props).not.toHaveProperty('fallback')
  })

  it("writes the page's own record from inside a node as @root, and keeps one element as it is", () => {
    const tree = recordLayout('projects', ({ data }) => <Graph {...base} filter={(f) => f.owner.eq(data.lead)} node={(service) => <Text>{`${service.name} for ${data.title}`}</Text>} />)
    expect(tree.props.filter).toBe('owner = {{lead}}')
    expect(tree.props.node).toEqual({ type: 'Text', props: {}, children: ['{{name}} for {{@root.title}}'] })
  })

  it('reads its nodes with what each draws and its edges with what each is drawn by, and the chosen node by its key', () => {
    const tree = Page({
      title: 'Map',
      children: Graph({ ...base, group: 'area', status: 'health', edgeLabel: 'protocol', animated: 'state = "busy"', select: 'service', node: <Field source="owner" />, children: <Field source="health" /> }),
    })
    const { plan, problems } = compileReadPlan(tree, { models })
    expect(problems).toEqual([])
    const part = (name: string) => plan.reads.find((read) => read.part === name)!
    expect(part('nodes')).toMatchObject({ resource: 'services', pageSize: 500, fields: expect.arrayContaining(['id', 'name', 'area', 'health', 'owner']) })
    expect(part('nodes').fields).not.toContain('map_x')
    expect(part('edges')).toMatchObject({ resource: 'links', fields: expect.arrayContaining(['id', 'from_id', 'to_id', 'protocol', 'state']) })
    expect(part('chosen')).toMatchObject({ resource: 'services', pageSize: 1, fields: expect.arrayContaining(['id', 'health']) })
  })

  it("reads the fields a node's text draws, and a text child's anywhere, as a prop's", () => {
    const tree = Page({ title: 'Map', children: [Graph({ ...base, node: <Text>{'Owned by {{owner}}'}</Text> }), CardRow({ resource: 'links', children: <Text>{'{{protocol}}'}</Text> })] })
    const { plan } = compileReadPlan(tree, { models })
    expect(plan.reads.find((read) => read.part === 'nodes')!.fields).toContain('owner')
    expect(plan.reads.find((read) => read.resource === 'links' && read.part === undefined)!.fields).toContain('protocol')
  })

  it("refuses a text child's {{path}} that no record around it has, where it draws", () => {
    const problemsOfTree = (children: ReturnType<typeof Graph>) => treeFindings(Page({ title: 'Map', children }), { models, actions: () => new Set() }).problems
    expect(problemsOfTree(Graph({ ...base, node: <Text>{'Owned by {{owner}}'}</Text> }))).toEqual([])
    expect(problemsOfTree(Graph({ ...base, node: <Text>{'Owned by {{owenr}}'}</Text> }))[0]).toMatch(/^<Page> › <Graph nodes="services"> node=\{<Text>\}: text "\{\{owenr\}\}": /)
    // A custom component's text, and the text of a fallback, in the node's record
    const Badge = component<object>('Badge', { fallback: ['Owned by {{owenr}}'] })
    const found = problemsOfTree(Graph({ ...base, node: Badge({ children: 'Run by {{ownr}}' }) }))
    expect(found).toHaveLength(2)
    expect(found[0]).toMatch(/node=\{<Badge>\}: text "\{\{ownr\}\}": /)
    expect(found[1]).toMatch(/node=\{<Badge>\}: fallback text "\{\{owenr\}\}": /)
  })

  it("checks each filter's page parameters against their choices, and edgeFilter's slots as a read's", () => {
    const choices = [{ id: 'busy', name: 'Busy' }]
    const findings = (graph: ReturnType<typeof Graph>) =>
      treeFindings(Page({ title: 'Map', children: [SelectInput({ source: 'state', choices, defaultValue: 'busy' }), SelectInput({ source: 'free' }), graph] }), { models, actions: () => new Set() }).problems
    expect(findings(Graph({ ...base, edgeFilter: 'state = "{{@params.state}}"' }))).toEqual([])
    expect(findings(Graph({ ...base, filter: 'health = "{{@params.state}}"' }))[0]).toMatch(/filter: .*busy/)
    expect(findings(Graph({ ...base, edgeFilter: 'protocol = "{{@params.free}}"' }))).toEqual([
      '<Page> › <Graph nodes="services">: edgeFilter: "{{@params.free}}" comes from a SelectInput without choices, so any text in the address would reach the read; give it choices',
    ])
    // Each read splits by one condition of the records around it: one on the nodes and one on the edges is fine
    const inCard = (graph: ReturnType<typeof Graph>) => treeFindings(Page({ title: 'Map', children: CardRow({ resource: 'services', children: graph }) }), { models, actions: () => new Set() }).problems
    expect(inCard(Graph({ ...base, filter: 'owner = "{{owner}}"', edgeFilter: 'protocol = "{{name}}"' }))).toEqual([])
  })

  it('checks what it names against its resources, and how it is laid out', () => {
    expect(problemsOf(Graph(base))).toEqual([])
    expect(problemsOf(Graph({ ...base, label: 'title', status: 'name', edgeStatus: 'protocol' }))).toEqual([
      '<Page> › <Graph nodes="services">: label: unknown field "title" on services',
      '<Page> › <Graph nodes="services">: status: "name" is text; a graph takes its colours from an enum field',
      '<Page> › <Graph nodes="services">: edgeStatus: "protocol" is text; a graph takes its colours from an enum field',
    ])
    expect(problemsOf(Graph({ ...base, x: 'map_x' }))).toEqual(['<Page> › <Graph nodes="services">: "x" and "y" place a node together; give both, or neither'])
    expect(problemsOf(Graph({ ...base, x: 'name', y: 'map_y' }))).toEqual(['<Page> › <Graph nodes="services">: x: "name" is text; a node\'s position is a number field'])
    expect(problemsOf(Graph({ ...base, dotted: 'color = "red"' }))).toEqual(['<Page> › <Graph nodes="services">: dotted: "color" is no field of links; a condition on an edge compares the edge\'s fields'])
    expect(problemsOf(Graph({ ...base, layout: 'force', direction: 'right' }))).toEqual(['<Page> › <Graph nodes="services">: "direction" is for a layered graph; a force layout has none'])
    expect(problemsOf(Graph({ ...base, node: <Table resource="links" /> }))).toEqual([
      "<Page> › <Graph nodes=\"services\">: node: <Table resource=\"links\"> reads records, which a node cannot: it draws once per node, from the node's own record; show related records with the children of \"select\"",
    ])
    const keyed = { ...models, services: { ...services, primaryKey: ['id', 'area'] } }
    expect(treeFindings(Page({ title: 'Map', children: Graph(base) }), { models: keyed, actions: () => new Set() }).problems[0]).toMatch(/has a key of 2 fields/)
  })

  it('takes children with select only, and a layout it knows', () => {
    expect(structureProblems(Page({ title: 'Map', children: Graph({ ...base, children: <Text>Chosen</Text> }) }))).toEqual(['<Page> › <Graph nodes="services">: takes children only with "select": they draw the row it chooses'])
    expect(structureProblems(Page({ title: 'Map', children: Graph({ ...base, layout: 'circle' as never }) }))).toEqual(['<Page> › <Graph nodes="services">: "layout" must be layered, force'])
  })

  it('leaves out what names a field the caller cannot read, and itself without its nodes, edges or ends', () => {
    const access = (restricted: Record<string, typeof services>): CallerAccess => ({ models: restricted, permissions: {}, actions: () => new Set() })
    const tree = Page({ title: 'Map', children: Graph({ ...base, status: 'health', edgeStatus: 'state', x: 'map_x', y: 'map_y', animated: 'state = "busy"', dashed: 'optional = true' }) })
    const withoutState = { ...links, fields: Object.fromEntries(Object.entries(links.fields).filter(([name]) => name !== 'state')) }
    const withoutY = { ...services, fields: Object.fromEntries(Object.entries(services.fields).filter(([name]) => name !== 'map_y')) }
    const pruned = pruneTree(tree, access({ services: withoutY, links: withoutState }))!.tree
    expect(pruned.children[0]).toMatchObject({ type: 'Graph', props: { status: 'health', dashed: 'optional = true' } })
    expect((pruned.children[0] as ReturnType<typeof Graph>).props).not.toHaveProperty('edgeStatus')
    expect((pruned.children[0] as ReturnType<typeof Graph>).props).not.toHaveProperty('animated')
    expect((pruned.children[0] as ReturnType<typeof Graph>).props).not.toHaveProperty('x')
    expect(pruneTree(tree, access({ services }))?.tree.children ?? []).toEqual([])
    const withoutTarget = { ...links, fields: Object.fromEntries(Object.entries(links.fields).filter(([name]) => name !== 'to_id')) }
    expect(pruneTree(tree, access({ services, links: withoutTarget }))?.tree.children ?? []).toEqual([])
  })

  it('reads as its groups, its nodes and each edge with its label, built in', async () => {
    const tree = Page({ title: 'Map', children: Graph({ ...base, edgeLabel: 'protocol' }) })
    const { plan } = compileReadPlan(tree, { models })
    const rows: Record<string, Record<string, unknown>[]> = { services: serviceRows.slice(0, 3), links: linkRows.map((row) => ({ ...row, protocol: row.id === 104 ? 'https' : null })) }
    const markdown = await pageText(tree, plan, { read: async ({ resource }) => ({ rows: rows[resource] ?? [] }), models })
    expect(markdown).toBe('# Map\n\n- Gateway\n- Sign-in\n- Web app\n\n- Web app → Gateway (https)')
  })
})
