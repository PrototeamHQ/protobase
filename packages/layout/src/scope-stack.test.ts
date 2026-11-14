import { describe, expect, it } from 'vitest'
import { CardRow, Field, Match, Page, RecordCard, Show, Switch, Table } from './blocks'
import { Text } from './elements'
import { checkPages, pageFindings } from './check-page'
import { structureProblems } from './check-structure'
import type { LayoutNode } from './node'
import { renderText } from './text/render-text'
import { nested as models } from './testing/models'

// A task's page: its claims as cards, each with its steps; names resolve through the records around them.
const input = { models, actions: () => new Set<string>() }
const page = (tree: LayoutNode) => ({ name: 'board', title: 'Board', tree })

const claimCards = (...children: LayoutNode[]) =>
  Page({ title: 'Board', children: RecordCard({ resource: 'tasks', children: CardRow({ resource: 'task_claims', filter: 'task_id = {{id}}', children }) }) })

describe('the scope stack', () => {
  it('checks the names of fields, conditions and steps through every record around them', () => {
    const tree = claimCards(Field({ source: 'title' }), Show({ when: "claimed_at:* AND title = 'x'", children: 'Claimed' }), Table({ resource: 'claim_steps', filter: 'claim_id = {{this.id}}' }))
    expect(pageFindings(page(tree), input)).toEqual({ problems: [], warnings: [] })
  })

  it('names every record a typo searched and the closest field', () => {
    expect(pageFindings(page(claimCards(Field({ source: 'claimd_at' }))), input).problems).toEqual([
      '<Page title="Board"> › <RecordCard resource="tasks"> › <CardRow resource="task_claims"> › <Field source="claimd_at">: "claimd_at" is no field of task_claims, tasks; did you mean claimed_at?',
    ].map((line) => line.replace('<Page title="Board">', '<Page>')))
  })

  it('warns of a shadowed bare name, and fails with strict', () => {
    const tree = claimCards(Show({ when: "status = 'open'", children: 'Open' }))
    expect(checkPages([page(tree)], input)).toEqual([
      'Page "board": <Page> › <RecordCard resource="tasks"> › <CardRow resource="task_claims"> › <Show>: "when": "status" resolves to task_claims; write ../status for the one of tasks',
    ])
    expect(() => checkPages([page(tree)], { ...input, strict: true })).toThrow('"status" resolves to task_claims')
    expect(checkPages([page(claimCards(Show({ when: "this.status = '{{../status}}'", children: 'Open' })))], { ...input, strict: true })).toEqual([])
  })

  it('refuses a condition over a name no record around it has, which would wait for another read', () => {
    expect(pageFindings(page(claimCards(Show({ when: 'steps_done > 1', children: 'x' }))), input).problems[0]).toContain('"steps_done" is no field of task_claims, tasks')
  })
})

describe('placeholder syntax', () => {
  it('refuses a {{…}} that holds no path, and triple braces, before the models are known', () => {
    expect(structureProblems(Page({ title: 'T', children: Table({ resource: 'tasks', title: '{{lookup a b}} {{{raw}}}' }) }))).toEqual([
      '<Page> › <Table resource="tasks">: "title": {{{…}}} is not taken; write {{path}}',
      '<Page> › <Table resource="tasks">: "title": "{{lookup a b}}" holds no path; write a field\'s name, ../name, this.name, @root.name, @params.name, @index, @first or @last',
    ])
    expect(structureProblems(Page({ title: 'T', children: Table({ resource: 'tasks', title: '{{../title}} {{@index}}' }) }))).toEqual([])
  })
})

describe('Switch and Match', () => {
  const tree = (when: string[], fallback?: string) => Page({ title: 'T', children: Switch({ fallback, children: when.map((w, index) => Match({ when: w, children: Text({ children: `Branch ${index}` }) })) }) })

  it('holds Matches only, and a Match sits in a Switch only', () => {
    expect(structureProblems(tree(["a = 'x'"]))).toEqual([])
    expect(structureProblems(Page({ title: 'T', children: Switch({ children: Text({ children: 'x' }) }) }))).toEqual(['<Page> › <Switch>: holds <Match>es only'])
    expect(structureProblems(Page({ title: 'T', children: Match({ when: "a = 'x'", children: 'x' }) }))).toEqual(['<Page>: holds a <Match>, which only a <Switch> takes'])
  })

  it('reads as its first Match that holds, else its fallback', () => {
    const record = { status: 'open', count: 3 }
    expect(renderText(tree(["status = 'open'", 'count > 1'], 'None'), { record })).toBe('# T\n\nBranch 0')
    expect(renderText(tree(["status = 'done'", 'count > 1'], 'None'), { record })).toBe('# T\n\nBranch 1')
    expect(renderText(tree(["status = 'done'"], 'None'), { record })).toBe('# T\n\nNone')
  })

  it('reads a Show as its fallback while its condition does not hold', () => {
    const show = Show({ when: "status = 'done'", fallback: Text({ children: 'Not yet' }), children: Text({ children: 'Done' }) })
    expect(renderText(show, { record: { status: 'open' } })).toBe('Not yet')
    expect(renderText(show, { record: { status: 'done' } })).toBe('Done')
  })
})
