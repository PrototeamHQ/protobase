import { describe, expect, it } from 'vitest'
import { Card, Field, Grid, Link, Page, RecordCard, Table } from './blocks'
import { component } from './component'
import { Fragment, jsx } from './jsx-runtime'

describe('createNode', () => {
  it('turns an element into plain data that survives JSON', () => {
    const node = Card({ title: 'Plan', span: 2, children: [Field({ name: 'plan.name' }), 'text'] })
    expect(node).toEqual({ type: 'Card', props: { title: 'Plan', span: 2 }, children: [{ type: 'Field', props: { name: 'plan.name' }, children: [] }, 'text'] })
    expect(JSON.parse(JSON.stringify(node))).toEqual(node)
  })

  it('drops undefined props and keeps element props as data', () => {
    const node = RecordCard({ resource: 'plans', filter: undefined, actions: [Link({ href: '/x', children: 'Go' })] })
    expect(node.props).toEqual({ resource: 'plans', actions: [{ type: 'Link', props: { href: '/x' }, children: ['Go'] }] })
  })

  it('flattens arrays and fragments and drops what React renders as nothing', () => {
    const fragment = jsx(Fragment, { children: [Field({ name: 'a' }), [Field({ name: 'b' })]] })
    const node = Grid({ children: [fragment, null, undefined, false, true, 3, ['x', [Field({ name: 'c' })]]] })
    expect(node.children).toEqual([
      { type: 'Field', props: { name: 'a' }, children: [] },
      { type: 'Field', props: { name: 'b' }, children: [] },
      '3',
      'x',
      { type: 'Field', props: { name: 'c' }, children: [] },
    ])
  })

  it('refuses a function prop and says where it is', () => {
    expect(() => jsx(Table, { resource: 'invoices', onRowClick: () => undefined })).toThrow(/<Table onRowClick> is a function\. Layouts are static data/)
  })

  it('refuses values JSON would change, also nested', () => {
    expect(() => jsx(Table, { resource: 'x', columns: ['a', () => 'b'] })).toThrow('<Table columns[1]> is a function')
    expect(() => jsx(Card, { title: new Date(0) })).toThrow('<Card title> is a Date')
    expect(() => jsx(Card, { span: Number.NaN })).toThrow('<Card span> is NaN')
    expect(() => jsx(Card, { meta: { deep: { at: new Map() } } })).toThrow('<Card meta.deep.at> is a Map')
    expect(() => jsx(Card, { children: [() => null] })).toThrow('<Card> has a child that is a function')
  })

  it('refuses HTML elements and plain functions as element types', () => {
    expect(() => jsx('div', {})).toThrow('<div> is an HTML element, not a layout block')
    const PlanCard = () => Card({})
    expect(() => jsx(PlanCard, {})).toThrow('<PlanCard> is not a layout block')
  })

  it('marks custom components so the app renders them from its registry', () => {
    const UsageChart = component<{ metric: string }>('UsageChart')
    expect(jsx(UsageChart, { metric: 'cpu', children: Field({ name: 'a' }) })).toEqual({
      type: 'UsageChart',
      props: { metric: 'cpu' },
      children: [{ type: 'Field', props: { name: 'a' }, children: [] }],
      custom: true,
    })
  })

  it('reserves the built-in names and wants PascalCase component names', () => {
    expect(() => component('Table')).toThrow('"Table" is a built-in block')
    expect(() => component('Fragment')).toThrow('built-in block')
    expect(() => component('usage-chart')).toThrow('must be PascalCase')
  })

  it('makes the same element from a block call and from jsx()', () => {
    expect(jsx(Page, { title: 'A', children: 'x' })).toEqual(Page({ title: 'A', children: 'x' }))
  })
})
