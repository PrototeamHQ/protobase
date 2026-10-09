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
      'p.tsx:3:38: <Table onRowClick> is a function; layout props must be static data. Use <Action name="..."> for behaviour, or a custom component for React code.',
      'p.tsx:4:24: <Card title> is a function; layout props must be static data. Use <Action name="..."> for behaviour, or a custom component for React code.',
      'p.tsx:4:61: <Card meta> is a new Date; layout props must be static data. Use <Action name="..."> for behaviour, or a custom component for React code.',
    ])
  })

  it('refuses function children and hooks', () => {
    const code = layout(`const [open] = useState(false)\nexport const p = <Card>{() => 'x'}</Card>`)
    expect(layoutProblems(code, 'p.tsx')).toEqual([
      'p.tsx:3:16: useState() is a hook; layouts have no state. Put stateful UI in a custom component.',
      "p.tsx:4:24: a child of <Card> is a function; layout children must be elements or text.",
    ])
  })
})

describe('isLayoutSource', () => {
  it('recognises layout files by their JSX import source', () => {
    expect([isLayoutSource(layout('')), isLayoutSource("import React from 'react'")]).toEqual([true, false])
  })
})
