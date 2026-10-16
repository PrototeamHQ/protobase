import { describe, expect, it, vi } from 'vitest'
import { ApiError, type BatchOp, type Client } from '@protobase/client'
import { parseFilter, type FieldModel, type ResourceModel, type ViewModel } from '@protobase/schema'
import { createLookups } from './lookups'
import type { ImportContext, ImportPlan } from './prepare-rows'
import { batchRows, checkImport, readHead, runImport } from './run-import'
import { memorySheetSource } from './sheet-source'

const field = (name: string, type: string, extra: Partial<FieldModel> = {}) => ({ name, column: name, type, nullable: false, readOnly: false, filterable: false, sortable: false, aliases: [], ...extra }) as FieldModel
const customers = {
  name: 'customers',
  table: { name: 'customers' },
  primaryKey: ['id'],
  fields: { id: field('id', 'integer', { readOnly: true, filterable: true }), email: field('email', 'text', { filterable: true }) },
} as unknown as ResourceModel
const orders = {
  name: 'orders',
  table: { name: 'orders' },
  primaryKey: ['id'],
  fields: {
    id: field('id', 'integer', { readOnly: true, filterable: true }),
    number: field('number', 'text', { filterable: true }),
    customer: field('customer', 'relation', { relation: { resource: 'customers', columns: ['customer_id'] } }),
    total: field('total', 'decimal', { nullable: true }),
  },
} as unknown as ResourceModel
const views = { customers: { resource: 'customers', names: { singular: 'Customer', plural: 'Customers' }, fields: {} }, orders: { resource: 'orders', names: { singular: 'Order', plural: 'Orders' }, fields: {} } } as unknown as Record<string, ViewModel>

const stored: Record<string, Record<string, unknown>[]> = {
  customers: [{ id: 1, email: 'ann@example.com' }, { id: 2, email: 'bob@example.com' }, { id: 3, email: 'bob@example.com' }],
  orders: [{ id: 10, number: 'SO-1' }],
}

// The values an `in(field, ...)` filter asks for
const asked = (filter: string) => {
  const parsed = parseFilter(filter)
  if (!parsed.ok || parsed.ast?.kind !== 'in') throw new Error(`Unexpected filter ${filter}`)
  return { field: parsed.ast.field.path[0]!, values: parsed.ast.values.map((value) => ('value' in value ? String(value.value) : '')) }
}

const fakeClient = (batchWrite: (ops: BatchOp[]) => Promise<{ results: Array<{ op: string }> }>) =>
  ({
    list: vi.fn(async (resource: string, { filter }: { filter: string }) => {
      const { field: name, values } = asked(filter)
      return { items: stored[resource]!.filter((record) => values.includes(String(record[name]))), nextPageToken: '' }
    }),
    batchWrite: vi.fn(batchWrite),
  }) as unknown as Client & { list: ReturnType<typeof vi.fn>; batchWrite: ReturnType<typeof vi.fn> }

const writeAll = async (ops: BatchOp[]) => ({ results: ops.map((op) => ({ op: op.op })) })

const contextOf = (client: Client): ImportContext => ({ model: orders, resources: { orders, customers }, views, lookups: createLookups(() => client) })

const header = { line: 1, cells: ['Order', 'Customer email', 'Total'] }
const plan: ImportPlan = {
  mode: 'create',
  columns: [
    { column: 0, field: 'number' },
    { column: 1, field: 'customer', matchBy: 'email' },
    { column: 2, field: 'total' },
  ],
  options: { decimal: ',', dateOrder: 'dmy' },
}

describe('checkImport', () => {
  it('converts every row, finds related records by the chosen field, and lists the problems without writing', async () => {
    const client = fakeClient(writeAll)
    const source = memorySheetSource([
      header,
      { line: 2, cells: ['SO-2', 'ann@example.com', '1.250,50'] },
      { line: 3, cells: ['SO-3', 'bob@example.com', ''] },
      { line: 4, cells: [null, null, null] },
      { line: 5, cells: ['SO-5', 'eve@example.com', 'twelve'] },
    ])
    const progress: number[] = []
    const check = await checkImport(source, undefined, plan, contextOf(client), (rows) => progress.push(rows))
    expect(check).toMatchObject({ rows: 3, creates: 1, updates: 0 })
    expect(check.problems).toEqual([
      { line: 3, cells: ['SO-3', 'bob@example.com', ''], problems: ['Customer: 2 customers have email “bob@example.com”'] },
      { line: 5, cells: ['SO-5', 'eve@example.com', 'twelve'], problems: ['Total: “twelve” is not a number', 'Customer: no customer has email “eve@example.com”'] },
    ])
    expect(check.preview[0]).toMatchObject({ line: 2, values: { number: 'SO-2', customer: 'ann@example.com', total: '1250.50' }, op: { op: 'create', data: { number: 'SO-2', customer: 1, total: '1250.50' } } })
    expect(progress).toEqual([3])
    expect(client.list).toHaveBeenCalledTimes(1)
    expect(client.batchWrite).not.toHaveBeenCalled()
  })

  it('reads the header and the first rows for the mapping', async () => {
    const source = memorySheetSource([header, { line: 2, cells: ['SO-2', 'ann@example.com', '1'] }])
    expect(await readHead(source, undefined)).toEqual({ headers: ['Order', 'Customer email', 'Total'], sample: [{ line: 2, cells: ['SO-2', 'ann@example.com', '1'] }] })
  })
})

describe('runImport', () => {
  const rows = (count: number) => Array.from({ length: count }, (_, index) => ({ line: index + 2, cells: [`SO-${index + 100}`, 'ann@example.com', '1'] }))

  it('writes in batches, sets aside a row the server refuses and writes the rest of its batch', async () => {
    const client = fakeClient(async (ops) => {
      const refused = ops.findIndex((op) => op.op === 'create' && op.data.number === 'SO-103')
      if (refused >= 0) throw new ApiError({ type: 'urn:protobase:problem:validation', title: 'Bad Request', status: 400, operation: refused, errors: [{ field: 'number', message: 'is taken', operation: refused }] } as never)
      return writeAll(ops)
    })
    const source = memorySheetSource([header, ...rows(batchRows + 5), { line: 900, cells: ['SO-X', 'nobody@example.com', '1'] }])
    const seen: number[] = []
    const result = await runImport(source, undefined, plan, contextOf(client), { client, onProgress: (progress) => seen.push(progress.created), cancelled: () => false })
    expect(result).toMatchObject({ created: batchRows + 4, updated: 0, skipped: 1, failed: 1, cancelled: false })
    expect(result.notWritten.map((row) => [row.line, row.problems])).toEqual([
      [900, ['Customer: no customer has email “nobody@example.com”']],
      [5, ['Number: is taken']],
    ])
    expect(seen).toEqual([batchRows - 1, batchRows + 4])
  })

  it('stops between batches when cancelled, keeping what it wrote', async () => {
    const client = fakeClient(writeAll)
    let batches = 0
    const result = await runImport(memorySheetSource([header, ...rows(batchRows * 3)]), undefined, plan, contextOf(client), { client, onProgress: () => batches++, cancelled: () => batches === 1 })
    expect(result).toMatchObject({ created: batchRows, cancelled: true })
    expect(client.batchWrite).toHaveBeenCalledTimes(1)
  })

  it('updates the records the match column finds, and creates the rest when creating or updating', async () => {
    const client = fakeClient(writeAll)
    const source = memorySheetSource([header, { line: 2, cells: ['SO-1', 'ann@example.com', '5'] }, { line: 3, cells: ['SO-9', 'ann@example.com', '6'] }])
    const upsert: ImportPlan = { ...plan, mode: 'upsert', match: { column: 0, field: 'number' } }
    await runImport(source, undefined, upsert, contextOf(client), { client, onProgress: () => {}, cancelled: () => false })
    expect(client.batchWrite.mock.calls[0]![0]).toEqual([
      { op: 'update', resource: 'orders', key: 10, etag: '*', data: { number: 'SO-1', customer: 1, total: '5' } },
      { op: 'create', resource: 'orders', data: { number: 'SO-9', customer: 1, total: '6' } },
    ])

    const update: ImportPlan = { ...upsert, mode: 'update' }
    const check = await checkImport(source, undefined, update, contextOf(client), () => {})
    expect(check).toMatchObject({ updates: 1, creates: 0 })
    expect(check.problems.map((row) => row.problems)).toEqual([['Nothing to update: no order has number “SO-9”']])
  })

  it('stops on an error that is no refused row', async () => {
    const client = fakeClient(async () => {
      throw new ApiError({ type: 'urn:protobase:problem:unauthorized', title: 'Unauthorized', status: 401 })
    })
    await expect(runImport(memorySheetSource([header, ...rows(2)]), undefined, plan, contextOf(client), { client, onProgress: () => {}, cancelled: () => false })).rejects.toThrow('Unauthorized')
  })
})
