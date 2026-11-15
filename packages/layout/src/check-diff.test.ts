import { describe, expect, it } from 'vitest'
import { Page, RecordCard } from './blocks'
import { pageProblems } from './check-page'
import { structureProblems } from './check-structure'
import { compileReadPlan } from './compile-read-plan'
import { Diff } from './diff'
import { Text } from './elements'
import type { LayoutChildren } from './node'
import { models } from './testing/models'

const input = { models, actions: () => new Set<string>() }
const inInvoice = (children: LayoutChildren) => Page({ title: 'x', children: RecordCard({ resource: 'invoices', recordKey: '1', children }) })
const card = '<Page> › <RecordCard resource="invoices">'

describe('Diff', () => {
  it('reads its source from the record around it', () => {
    const tree = inInvoice(Diff({ source: 'memo', emptyText: 'No changes' }))
    expect(structureProblems(tree)).toEqual([])
    expect(pageProblems({ name: 'x', title: 'x', tree }, input)).toEqual([])
    expect(compileReadPlan(tree, { models }).plan.reads[0]!.fields).toContain('memo')
  })

  it('fails on a source no record around it has, naming the closest field', () => {
    const tree = inInvoice(Diff({ source: 'meme' }))
    expect(pageProblems({ name: 'x', title: 'x', tree }, input)).toEqual([`${card} › <Diff source="meme">: "meme" is no field of invoices; did you mean memo?`])
  })

  it('needs a record, and stands on its own outside a line of text', () => {
    expect(structureProblems(Page({ title: 'x', children: Diff({ source: 'memo' }) }))).toEqual(['<Page> › <Diff source="memo">: needs a record: put it inside a RecordCard, a CardRow or a RecordsIterator'])
    expect(structureProblems(inInvoice(Text({ children: Diff({ source: 'memo' }) })))[0]).toContain('holds text')
  })
})
