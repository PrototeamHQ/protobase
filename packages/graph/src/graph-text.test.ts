import { describe, expect, it } from 'vitest'
import { compileReadPlan, Page, pageText, Text, type PlanRead } from '@protobase/layout'
import { Graph, graphText } from './layout'
import { linkRows, models, sampleFields, serviceRows } from './testing/sample-graph'

const labels = { services: { health: { valueLabels: { up: 'Up', degraded: 'Degraded', down: 'Down' } }, area: { valueLabels: { edge: 'Edge', core: 'Core', data: 'Data' } } } }

const textOf = async (rows: Record<string, Record<string, unknown>[]>, props: Partial<Parameters<typeof Graph>[0]> = {}) => {
  const tree = Page({ title: 'Map', children: Graph({ nodes: 'services', edges: 'links', ...sampleFields, ...props }) })
  const { plan } = compileReadPlan(tree, { models })
  const read = async ({ resource }: PlanRead) => ({ rows: rows[resource] ?? [] })
  return pageText(tree, plan, { read, models, labels, forms: { Graph: graphText } })
}

describe('a graph’s text form', () => {
  it('lists each group with its nodes and their status, then each edge as a → b', async () => {
    const markdown = await textOf({ services: serviceRows.slice(0, 5), links: linkRows })
    expect(markdown).toBe(
      [
        '# Map',
        '**Core**\n- Orders (Up)\n- Billing (Down)',
        '**Edge**\n- Gateway (Up)\n- Sign-in (Up)\n- Web app (Degraded)',
        '- Gateway → Orders\n- Web app → Gateway\n- Orders → Billing',
      ].join('\n\n'),
    )
  })

  it('reads as its empty text without nodes, and as its heading alone without the records', async () => {
    expect(await textOf({}, { empty: 'Nothing runs yet' })).toBe('# Map\n\nNothing runs yet')
    const tree = Page({ title: 'Map', children: [Graph({ nodes: 'services', edges: 'links', ...sampleFields }), Text({ children: 'After' })] })
    const { plan } = compileReadPlan(tree, { models })
    expect(await pageText(tree, plan, { read: async () => ({ rows: [] }), forms: { Graph: graphText } })).toBe('# Map\n\nAfter')
  })
})
