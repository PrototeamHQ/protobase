import { describe, expect, it } from 'vitest'
import { fieldRef } from './field-ref'
import { pruneByShape, shapes as s } from './ref-shape'

const visible = (name: string) => name !== 'cost'

type Item = { kind: 'a'; field: string; note: string } | { kind: 'b'; props: Record<string, unknown> }

describe('pruneByShape', () => {
  it('drops hidden field names, and lists and objects by what they require', () => {
    const shape = s.object<{ title: string; columns: string[]; sort: Array<[string, string]>; chart: { field: string; range: string } }>({
      title: s.field,
      columns: s.list(s.field),
      sort: s.list(s.tuple(s.field, s.data)),
      chart: s.object<{ field: string; range: string }>({ field: s.field, range: s.data }, { requires: ['field'] }),
    })
    expect(pruneByShape({ title: 'cost', columns: ['name', 'cost'], sort: [['cost', 'desc'], ['name', 'asc']], chart: { field: 'cost', range: '7d' } }, shape, visible)).toEqual({
      columns: ['name'],
      sort: [['name', 'asc']],
    })
  })

  it('drops free-form data holding a hidden field reference, and keys naming hidden fields', () => {
    expect(pruneByShape({ by: fieldRef('cost'), size: 3 }, s.refs, visible)).toBeUndefined()
    expect(pruneByShape({ by: [fieldRef('name')], size: 3 }, s.refs, visible)).toEqual({ by: [fieldRef('name')], size: 3 })
    expect(pruneByShape({ name: { label: 'Name' }, cost: { label: 'Cost' } }, s.keys(), visible)).toEqual({ name: { label: 'Name' } })
    expect(pruneByShape({ name: 1, cost: 2 }, s.keys({ all: true }), visible)).toBeUndefined()
  })

  it('drops a list left empty when it must hold something', () => {
    expect(pruneByShape(['cost'], s.list(s.field, { nonEmpty: true }), visible)).toBeUndefined()
    expect(pruneByShape(['cost'], s.list(s.field), visible)).toEqual([])
  })

  it('tells items apart by kind, leaving out kinds and parts the shape does not declare', () => {
    const shape = s.list(
      s.oneOf<Item>({
        a: s.object<Extract<Item, { kind: 'a' }>>({ kind: s.data, field: s.field, note: s.data }, { requires: ['field'] }),
        b: s.object<Extract<Item, { kind: 'b' }>>({ kind: s.data, props: s.refs }, { requires: ['props'] }),
      }),
    )
    const items = [
      { kind: 'a', field: 'name', note: 'kept', extra: 'cost' },
      { kind: 'a', field: 'cost', note: 'gone' },
      { kind: 'b', props: { of: fieldRef('cost') } },
      { kind: 'c', field: 'name' },
    ]
    expect(pruneByShape(items, shape, visible)).toEqual([{ kind: 'a', field: 'name', note: 'kept' }])
  })

  it('hands parts it cannot read by shape to code, and tidies objects after', () => {
    const shape = s.object<{ count: number; items: string[] }>({ count: s.map<number>((count) => (count > 0 ? count : undefined)), items: s.list(s.field) }, { after: (value) => ({ ...value, count: value.items.length }) })
    expect(pruneByShape({ count: 0, items: ['name', 'cost'] }, shape, visible)).toEqual({ count: 1, items: ['name'] })
  })
})
