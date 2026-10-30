import { describe, expect, it } from 'vitest'
import type { ResourceModel } from '@protobase/schema'
import { emptyLinesState, planLinesOps, shownIds, type LinesState } from './lines-plan'

const field = (name: string, type: string, extra: Record<string, unknown> = {}) => ({ name, column: name, type, nullable: false, readOnly: false, filterable: false, sortable: false, aliases: [], ...extra })

const model = {
  name: 'invoice_lines',
  primaryKey: ['id'],
  fields: {
    id: field('id', 'text', { readOnly: true }),
    invoice_id: field('invoice_id', 'relation', { relation: { resource: 'invoices', columns: ['invoice_id'] } }),
    position: field('position', 'integer'),
    description: field('description', 'text'),
    quantity: field('quantity', 'integer'),
    note: field('note', 'text', { nullable: true }),
  },
} as unknown as ResourceModel

const stored = [1, 2, 3].map((n) => ({ id: `l${n}`, invoice_id: 'i1', position: n, description: `Line ${n}`, quantity: n, note: null, etag: `"l${n}"` }))

const plan = (state: Partial<LinesState>) => planLinesOps({ model, position: 'position', link: { field: 'invoice_id', value: 'i1' }, stored, state: { ...emptyLinesState, ...state } })

describe('shownIds', () => {
  it('keeps the stored lines, then the new ones', () => {
    expect(shownIds(['a', 'b', 'c'], { ...emptyLinesState, added: ['new1'], removed: ['b'] })).toEqual(['a', 'c', 'new1'])
  })

  it('follows the order on screen and adds the lines it does not name', () => {
    expect(shownIds(['a', 'b', 'c'], { ...emptyLinesState, order: ['c', 'gone', 'a'], added: ['new1'] })).toEqual(['c', 'a', 'b', 'new1'])
  })
})

describe('planLinesOps', () => {
  it('writes nothing when nothing changed', () => {
    expect(plan({})).toEqual({ ops: [], rows: [] })
    expect(plan({ edits: { l1: { quantity: '1' } } })).toEqual({ ops: [], rows: [] })
  })

  it('reorders the lines with the ETags they were read with', () => {
    expect(plan({ order: ['l2', 'l1', 'l3'] }).ops).toEqual([{ op: 'reorder', resource: 'invoice_lines', field: 'position', keys: ['l2', 'l1', 'l3'], etags: { l2: '"l2"', l1: '"l1"', l3: '"l3"' } }])
  })

  it('updates only the fields that changed, as the API takes them', () => {
    expect(plan({ edits: { l2: { quantity: '5', description: 'Line 2' } } })).toEqual({
      ops: [{ op: 'update', resource: 'invoice_lines', key: 'l2', data: { quantity: 5 }, etag: '"l2"' }],
      rows: ['l2'],
    })
  })

  it('deletes a removed line and forgets its edits', () => {
    expect(plan({ removed: ['l2'], edits: { l2: { quantity: '5' } } })).toEqual({ ops: [{ op: 'delete', resource: 'invoice_lines', key: 'l2', etag: '"l2"' }], rows: ['l2'] })
  })

  it('creates a new line after the last, with only what was filled in', () => {
    expect(plan({ added: ['new1'], edits: { new1: { description: 'Extra', note: ' ' } } })).toEqual({
      ops: [{ op: 'create', resource: 'invoice_lines', data: { description: 'Extra', invoice_id: 'i1', position: 4 } }],
      rows: ['new1'],
    })
  })

  it('numbers new lines on from the kept ones when the order changed too', () => {
    const { ops } = plan({ order: ['l3', 'l1', 'l2', 'new1'], added: ['new1'], removed: ['l2'], edits: { l1: { quantity: '9' } } })
    expect(ops).toEqual([
      { op: 'delete', resource: 'invoice_lines', key: 'l2', etag: '"l2"' },
      { op: 'update', resource: 'invoice_lines', key: 'l1', data: { quantity: 9 }, etag: '"l1"' },
      // l1 was written by the update before, which checked its ETag
      { op: 'reorder', resource: 'invoice_lines', field: 'position', keys: ['l3', 'l1'], etags: { l3: '"l3"', l1: '*' } },
      { op: 'create', resource: 'invoice_lines', data: { invoice_id: 'i1', position: 3 } },
    ])
  })

  it('moves the kept lines out of the way of a new line between them', () => {
    expect(plan({ order: ['l1', 'new1', 'l2', 'l3'], added: ['new1'] })).toEqual({
      ops: [
        { op: 'reorder', resource: 'invoice_lines', field: 'position', keys: ['l1', 'l2', 'l3'], start: 5, etags: { l1: '"l1"', l2: '"l2"', l3: '"l3"' } },
        { op: 'create', resource: 'invoice_lines', data: { invoice_id: 'i1', position: 2 }, ref: 'line1' },
        { op: 'reorder', resource: 'invoice_lines', field: 'position', keys: ['l1', { $ref: 'line1' }, 'l2', 'l3'], etags: { l1: '*', l2: '*', l3: '*' } },
      ],
      rows: [undefined, 'new1', undefined],
    })
  })
})
