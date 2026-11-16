import { describe, expect, it } from 'vitest'
import { isLayoutSource, layoutProblems } from './layout-check'

const layout = (body: string) => `/** @jsxImportSource @protobase/layout */\nimport { Card, Table, page } from '@protobase/layout'\n${body}\n`

describe('layoutProblems', () => {
  it('accepts static props, constants and nested elements', () => {
    const code = layout(`const open = "status = 'open'"\nexport const p = page('p', <Card title="A" actions={<Table resource="x" filter={open} columns={['a', 'b']} />}>text {1}</Card>)`)
    expect(layoutProblems(code, 'p.tsx')).toEqual([])
  })

  it('refuses functions, classes and new values in props, with file and line', () => {
    const code = layout(`export const p = <Table resource="x" onRowClick={() => 1} />\nexport const q = <Card title={(function () { return 'a' })} meta={new Date()} />`)
    expect(layoutProblems(code, 'p.tsx')).toEqual([
      'p.tsx:3:38: <Table onRowClick> is a function; layout props must be static data, a filter or condition may be one arrow of the builder, the node of a Graph one arrow of its record. Use <Action name="..."> for behaviour, or a custom component for React code.',
      'p.tsx:4:24: <Card title> is a function; layout props must be static data, a filter or condition may be one arrow of the builder, the node of a Graph one arrow of its record. Use <Action name="..."> for behaviour, or a custom component for React code.',
      'p.tsx:4:61: <Card meta> is a new Date; layout props must be static data, a filter or condition may be one arrow of the builder, the node of a Graph one arrow of its record. Use <Action name="..."> for behaviour, or a custom component for React code.',
    ])
  })

  it('refuses function children and hooks', () => {
    const code = layout(`const [open] = useState(false)\nexport const p = <Card>{() => 'x'}</Card>`)
    expect(layoutProblems(code, 'p.tsx')).toEqual([
      'p.tsx:3:16: useState() is a hook; layouts have no state. Put stateful UI in a custom component.',
      "p.tsx:4:24: a child of <Card> is a function; layout children must be elements or text, or for a RecordCard, CardRow, ReferenceField, RecordsIterator one arrow of its record.",
    ])
  })
})

describe('the arrows a layout writes as data', () => {
  it("accept a graph's node arrow and its edge conditions' arrows, and no node arrow on another block", () => {
    const code = layout(`export const p = <Graph nodes="s" edges="l" animated={(l) => l.state.eq('busy')} dotted={(l) => l.kind.eq('copy')} node={(s) => <Text>{s.name}</Text>} />\nexport const q = <Card node={(s) => s.name} />`)
    expect(layoutProblems(code, 'p.tsx').map((problem) => problem.split(';')[0])).toEqual(['p.tsx:4:24: <Card node> is a function'])
  })

  it("accept a filter's arrow and a record block's child arrow, each one expression", () => {
    const code = layout(`export const p = <RecordCard resource="tasks" filter={(f) => f.done.eq(false)}>{(task) => <Card title={task.title} />}</RecordCard>`)
    expect(layoutProblems(code, 'p.tsx')).toEqual([])
  })

  it('refuse one with a body of statements, and a function child of a block that draws no record', () => {
    const code = layout(`export const p = <RecordCard resource="tasks" filter={(f) => { return f.done.eq(false) }}>{(task) => { return null }}</RecordCard>\nexport const q = <Card>{(task) => task.title}</Card>`)
    expect(layoutProblems(code, 'p.tsx').map((problem) => problem.split(';')[0])).toEqual(['p.tsx:3:47: <RecordCard filter> is a function', 'p.tsx:3:91: a child of <RecordCard> is a function', 'p.tsx:4:24: a child of <Card> is a function'])
  })
})

describe('isLayoutSource', () => {
  it('recognises layout files by their JSX import source', () => {
    expect([isLayoutSource(layout('')), isLayoutSource("import React from 'react'")]).toEqual([true, false])
  })
})
