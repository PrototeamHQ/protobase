import { describe, expect, it } from 'vitest'
import { Action, Card, Field, Grid, Link, ModalForm, Page, Progress, RecordCard, RecordCards, Show, Stat, Table } from './blocks'
import { component } from './component'
import { isPageDefinition, page } from './page'
import { billing } from './testing/billing'
import type { LayoutNode } from './node'

const problems = (tree: LayoutNode) => {
  try {
    page('test', tree)
    return []
  } catch (error) {
    return (error as Error).message.split('\n').slice(1).map((line) => line.replace(/^\s+- /, ''))
  }
}

describe('page', () => {
  it('compiles a .tsx layout through @protobase/layout/jsx-runtime into a model', () => {
    const model = billing.toModel()
    expect(isPageDefinition(billing)).toBe(true)
    expect(model).toMatchObject({ name: 'billing', title: 'Billing', icon: 'credit-card', nav: { group: 'Account' } })
    expect(model.tree.type).toBe('Page')
    const [grid, cardRow, table, questions] = model.tree.children as LayoutNode[]
    expect(grid!.type).toBe('Grid')
    expect(cardRow!.props.actions).toMatchObject({ type: 'ModalForm', props: { mode: 'create', fields: ['brand', 'last4'] } })
    expect(table!.props).toEqual({ resource: 'invoices', sort: 'number desc', columns: ['number', 'status', 'total'], limit: 10, title: 'Invoices' })
    expect(questions!.children).toEqual(['Mail ', { type: 'Link', props: { href: 'mailto:billing@example.com' }, children: ['billing@example.com'] }, '3'])
    expect(JSON.parse(JSON.stringify(model))).toEqual(model)
  })

  it('hands out a copy, so a caller cannot change the definition', () => {
    const model = billing.toModel()
    model.tree.props.title = 'Changed'
    expect(billing.toModel().title).toBe('Billing')
    expect(billing.toModel().tree.props.title).toBe('Billing')
  })

  it('wants a Page at the root and nowhere else', () => {
    expect(problems(Card({ title: 'x' }))).toEqual(['the root element is <Card>, it must be <Page>'])
    expect(problems(Page({ title: 'a', children: Page({ title: 'b' }) }))).toEqual(['<Page> › <Page>: <Page> is only allowed as the root'])
  })

  it('names unknown, missing and mistyped props', () => {
    const tree: LayoutNode = { type: 'Page', props: { title: 'x' }, children: [{ type: 'Table', props: { colums: ['a'], limit: 0 }, children: [] }] }
    expect(problems(tree)).toEqual([
      '<Page> › <Table>: unknown prop "colums"; it takes resource, filter, sort, title, description, actions, columns, limit, display, empty, span',
      '<Page> › <Table>: "resource" is required',
      '<Page> › <Table>: "limit" must be a positive whole number',
    ])
  })

  it('lays RecordCards out stacked or in a carousel of cards a share of its width wide', () => {
    expect(problems(Page({ title: 'x', children: RecordCards({ resource: 'listings', layout: 'carousel', cardWidth: '1/3' }) }))).toEqual([])
    expect(problems(Page({ title: 'x', children: RecordCards({ resource: 'listings', layout: 'stack' }) }))).toEqual([])
    const wrong: LayoutNode = { type: 'Page', props: { title: 'x' }, children: [{ type: 'RecordCards', props: { resource: 'listings', layout: 'row', cardWidth: '3/4' }, children: [] }] }
    expect(problems(wrong)).toEqual([
      '<Page> › <RecordCards resource="listings">: "layout" must be stack, carousel',
      '<Page> › <RecordCards resource="listings">: "cardWidth" must be 1/4, 1/3, 1/2, 2/3',
    ])
  })

  it('caps a Table at a number of records and opens it in a display, without pages', () => {
    const table = (props: Record<string, unknown>): LayoutNode => ({ type: 'Page', props: { title: 'x' }, children: [{ type: 'Table', props: { resource: 'listings', ...props }, children: [] }] })
    expect(problems(table({ limit: 8, display: 'cards' }))).toEqual([])
    expect(problems(table({ display: 3 }))).toEqual(['<Page> › <Table resource="listings">: "display" must be text'])
    expect(problems(table({ pageSize: 8 }))).toEqual([
      '<Page> › <Table resource="listings">: unknown prop "pageSize"; it takes resource, filter, sort, title, description, actions, columns, limit, display, empty, span',
    ])
  })

  it('refuses children on blocks that take none, and unknown blocks', () => {
    const tree: LayoutNode = { type: 'Page', props: { title: 'x' }, children: [{ type: 'Stat', props: { label: 'a', value: 1 }, children: ['b'] }, { type: 'Sparkline', props: {}, children: [] }] }
    expect(problems(tree)).toEqual(['<Page> › <Stat>: takes no children', "<Page> › <Sparkline>: <Sparkline> is not a block; custom components are declared with component('Sparkline')"])
  })

  it('wants a record around elements that show its fields', () => {
    const tree = Page({
      title: 'x',
      children: [
        Field({ name: 'a' }),
        Stat({ label: 's', field: 'a' }),
        Progress({ value: 'used' }),
        ModalForm({ mode: 'edit', label: 'Edit', fields: ['a'] }),
        Action({ name: 'go' }),
        RecordCard({ resource: 'plans', children: [Field({ name: 'name' }), ModalForm({ mode: 'edit', label: 'Edit', fields: ['name'] })] }),
        Progress({ value: 3, max: 10 }),
        Action({ name: 'go', resource: 'plans' }),
      ],
    })
    expect(problems(tree)).toEqual([
      '<Page> › <Field name="a">: needs a record: put it inside a RecordCard or a CardRow',
      '<Page> › <Stat>: with "field" needs a record: put it inside a RecordCard or a CardRow',
      '<Page> › <Progress>: with a field name needs a record: put it inside a RecordCard or a CardRow',
      '<Page> › <ModalForm>: in edit mode needs a record: put it inside a RecordCard or a CardRow, or name "resource" and "recordKey"',
      '<Page> › <Action name="go">: needs a record: put it inside a RecordCard or a CardRow, or name "resource"',
    ])
  })

  it('gives a RecordCard header the record, but not a CardRow header', () => {
    const tree = Page({
      title: 'x',
      children: [
        RecordCard({ resource: 'plans', actions: Action({ name: 'edit' }) }),
        { type: 'CardRow', props: { resource: 'plans', actions: Action({ name: 'add' }) }, children: [] },
      ],
    })
    expect(problems(tree)).toEqual(['<Page> › <CardRow resource="plans"> actions={<Action name="add">}: needs a record: put it inside a RecordCard or a CardRow, or name "resource"'])
  })

  it('wants exactly one source for a Stat, and parsable conditions', () => {
    const tree = Page({ title: 'x', children: [Stat({ label: 'a', value: 1, resource: 'plans' }), Stat({ label: 'b', value: 1, filter: "a = 'b'" }), Show({ when: 'status = ' })] })
    const found = problems(tree)
    expect(found.slice(0, 2)).toEqual(['<Page> › <Stat resource="plans">: takes exactly one of "value", "resource" (a count) and "field"', '<Page> › <Stat>: "filter" needs "resource"'])
    expect(found[2]).toMatch(/^<Page> › <Show>: "when" is not a valid condition: /)
  })

  it('wants a link to go to an address, or to an href that leaves the app', () => {
    const tree: LayoutNode = Page({
      title: 'x',
      children: [
        Link({ to: { kind: 'list', resource: 'invoices' }, children: 'Invoices' }),
        Link({ href: 'mailto:billing@example.com' }),
        Link({ href: '/invoices?filter=x' }),
        { type: 'Link', props: {}, children: [] },
        { type: 'Link', props: { to: 'invoices' }, children: [] },
      ],
    })
    expect(problems(tree)).toEqual([
      expect.stringMatching(/^<Page> › <Link>: href "\/invoices\?filter=x" points inside the app; give the link `to` instead/),
      '<Page> › <Link>: takes exactly one of "to" (an address in the app) and "href" (a link that leaves it)',
      "<Page> › <Link>: \"to\" must be an address, such as { kind: 'list', resource: 'orders' }",
    ])
  })

  it('leaves the props of custom components to the app', () => {
    const Sparkline = component<{ anything: string }>('Sparkline')
    expect(problems(Page({ title: 'x', children: Grid({ children: Sparkline({ anything: 'goes' }) }) }))).toEqual([])
  })

  it('checks the page name', () => {
    expect(() => page('Billing', Page({ title: 'x' }))).toThrow('must start with a lowercase letter')
    expect(() => page('billing/plans', Page({ title: 'x' }))).toThrow('only letters, digits and dashes')
  })

  it('reports every problem at once, under the page name', () => {
    expect(() => page('broken', Page({ title: 'x', children: [Field({ name: 'a' }), Table({ resource: 'r', limit: 1.5 })] }))).toThrow(
      'Page "broken" is not a valid layout:\n  - <Page> › <Field name="a">: needs a record: put it inside a RecordCard or a CardRow\n  - <Page> › <Table resource="r">: "limit" must be a positive whole number',
    )
  })
})
