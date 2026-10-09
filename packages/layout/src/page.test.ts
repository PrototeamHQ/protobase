import { describe, expect, it } from 'vitest'
import { Action, Card, Field, Grid, ModalForm, Page, Progress, RecordCard, Show, Stat, Table } from './blocks'
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
    expect(table!.props).toEqual({ resource: 'invoices', sort: 'number desc', columns: ['number', 'status', 'total'], pageSize: 10, title: 'Invoices' })
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
    const tree: LayoutNode = { type: 'Page', props: { title: 'x' }, children: [{ type: 'Table', props: { colums: ['a'], pageSize: 0 }, children: [] }] }
    expect(problems(tree)).toEqual([
      '<Page> › <Table>: unknown prop "colums"; it takes resource, filter, sort, title, description, actions, columns, pageSize, empty, span',
      '<Page> › <Table>: "resource" is required',
      '<Page> › <Table>: "pageSize" must be a positive whole number',
    ])
  })

  it('refuses children on blocks that take none, and unknown blocks', () => {
    const tree: LayoutNode = { type: 'Page', props: { title: 'x' }, children: [{ type: 'Stat', props: { label: 'a', value: 1 }, children: ['b'] }, { type: 'Chart', props: {}, children: [] }] }
    expect(problems(tree)).toEqual(['<Page> › <Stat>: takes no children', "<Page> › <Chart>: <Chart> is not a block; custom components are declared with component('Chart')"])
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

  it('leaves the props of custom components to the app', () => {
    const Chart = component<{ anything: string }>('Chart')
    expect(problems(Page({ title: 'x', children: Grid({ children: Chart({ anything: 'goes' }) }) }))).toEqual([])
  })

  it('checks the page name', () => {
    expect(() => page('Billing', Page({ title: 'x' }))).toThrow('must start with a lowercase letter')
    expect(() => page('billing/plans', Page({ title: 'x' }))).toThrow('only letters, digits and dashes')
  })

  it('reports every problem at once, under the page name', () => {
    expect(() => page('broken', Page({ title: 'x', children: [Field({ name: 'a' }), Table({ resource: 'r', pageSize: 1.5 })] }))).toThrow(
      'Page "broken" is not a valid layout:\n  - <Page> › <Field name="a">: needs a record: put it inside a RecordCard or a CardRow\n  - <Page> › <Table resource="r">: "pageSize" must be a positive whole number',
    )
  })
})
