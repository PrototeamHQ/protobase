import { describe, expect, it } from 'vitest'
import { Field, Page, Table } from './blocks'
import { pageProblems } from './check-page'
import { structureProblems } from './check-structure'
import type { LayoutNode } from './node'
import { SelectInput, inputValue, pageParamValues } from './page-params'
import { nested as models } from './testing/models'
import { renderText } from './text/render-text'

const windows = SelectInput({ source: 'window', label: 'Window', choices: [{ id: '7d', name: 'Last 7 days' }, { id: '30d', name: 'Last 30 days' }], defaultValue: '7d' })
const recent = (filter = 'claimed_at >= now() - {{@params.window}}') => Table({ resource: 'task_claims', filter })
const page = (...children: LayoutNode[]) => Page({ title: 'Claims', children })
const problems = (tree: LayoutNode) => pageProblems({ name: 'claims', title: 'Claims', tree }, { models, actions: () => new Set() })

describe('page parameter values', () => {
  it('holds a choice the address gives, and the default for none or an unknown one', () => {
    const tree = page(windows)
    expect(pageParamValues(tree, { window: '30d' })).toEqual({ window: '30d' })
    expect(pageParamValues(tree)).toEqual({ window: '7d' })
    expect(pageParamValues(tree, { window: '1y', other: 'x' })).toEqual({ window: '7d' })
  })

  it('holds none without a default, and any value without choices', () => {
    expect(inputValue({ source: 'window', choices: [{ id: 7, name: 'Week' }] }, '30')).toBeUndefined()
    expect(inputValue({ source: 'window', choices: [{ id: 7, name: 'Week' }] }, '7')).toBe('7')
    expect(inputValue({ source: 'window' }, 'anything')).toBe('anything')
  })
})

describe('page parameter checks', () => {
  it('refuses a name set twice, a default among no choices and an id twice', () => {
    expect(structureProblems(page(windows, SelectInput({ source: 'window', choices: [{ id: 'a', name: 'A' }, { id: 'a', name: 'B' }], defaultValue: 'b' })))).toEqual([
      '<Page> › <SelectInput source="window">: "choices" holds the id "a" twice',
      '<Page> › <SelectInput source="window">: "defaultValue" "b" is none of the choices\' ids: a, a',
      '<Page> › <SelectInput source="window">: the page parameter "window" is set twice on the page; give each SelectInput and select a name of its own',
    ])
    expect(structureProblems(page(SelectInput({ source: 'a-b' })))).toEqual(['<Page> › <SelectInput source="a-b">: "source" names a page parameter, such as window, and "a-b" is none'])
  })

  it('takes children of a Table only with select, which needs a resource of its own', () => {
    expect(structureProblems(page(Table({ resource: 'tasks', children: Field({ source: 'title' }) })))).toContain('<Page> › <Table resource="tasks">: takes children only with "select": they draw the row it chooses')
    expect(structureProblems(page(Table({ resource: 'tasks', select: 'task', children: Field({ source: 'title' }) })))).toEqual([])
    expect(structureProblems(page(Table({ resource: 'tasks', select: 'window' }), windows))).toContain(
      '<Page> › <SelectInput source="window">: the page parameter "window" is set twice on the page; give each SelectInput and select a name of its own',
    )
  })

  it('parses a filter fed by @params once per choice, and refuses a choice that breaks it', () => {
    expect(problems(page(windows, recent()))).toEqual([])
    const broken = SelectInput({ source: 'window', choices: [{ id: '7d', name: 'Week' }, { id: 'soon', name: 'Soon' }], defaultValue: '7d' })
    const found = problems(page(broken, recent()))
    expect(found).toHaveLength(1)
    expect(found[0]).toMatch(/^<Page> › <Table resource="task_claims">: filter with window = "soon": /)
  })

  it('parses it with no value too when the input has no default', () => {
    const optional = SelectInput({ source: 'window', choices: [{ id: '7d', name: 'Week' }] })
    expect(problems(page(optional, recent()))[0]).toMatch(/filter with window = "": /)
    expect(problems(page(optional, recent("status = '{{@params.window}}'")))).toEqual([])
  })

  it('refuses a SelectInput without choices feeding a filter, and takes it in text', () => {
    expect(problems(page(SelectInput({ source: 'window' }), recent("status = '{{@params.window}}'")))).toEqual([
      '<Page> › <Table resource="task_claims">: filter: "{{@params.window}}" comes from a SelectInput without choices, so any text in the address would reach the read; give it choices',
    ])
    expect(problems(page(SelectInput({ source: 'window' }), Table({ resource: 'task_claims', title: 'Since {{@params.window}}' })))).toEqual([])
  })

  it("resolves a select's children in the row it chooses", () => {
    expect(problems(page(Table({ resource: 'task_claims', select: 'claim', children: Field({ source: 'claimed_at' }) })))).toEqual([])
    expect(problems(page(Table({ resource: 'task_claims', select: 'claim', children: Field({ source: 'title' }) })))).toEqual([
      '<Page> › <Table resource="task_claims"> › <Field source="title">: "title" is no field of task_claims',
    ])
  })
})

describe('page parameters as text', () => {
  it("reads a SelectInput as its label and its choice's name, and fills @params", () => {
    const tree = page(windows, Table({ resource: 'task_claims', title: 'Claims since {{@params.window}}' }))
    expect(renderText(tree, { params: { window: '30d' } })).toContain('**Window**: Last 30 days')
    expect(renderText(tree, { params: { window: 'nope' } })).toContain('**Window**: Last 7 days')
    expect(renderText(tree)).toContain('Claims since 7d')
  })

  it("reads a select's children in the row the caller read, and nothing without one", () => {
    const tree = page(Table({ resource: 'task_claims', select: 'claim', children: Field({ source: 'status', label: 'Status' }) }))
    expect(renderText(tree, { records: () => [{ id: 3, status: 'open' }] })).toContain('**Status**: open')
    expect(renderText(tree)).not.toContain('Status')
  })
})
