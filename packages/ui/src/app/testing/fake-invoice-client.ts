import type { BatchOp, Client } from '@protobase/client'
import type { ResourceModel, ViewModel } from '@protobase/schema'

const field = (name: string, type: string, extra: Record<string, unknown> = {}) => ({ name, column: name, type, nullable: false, readOnly: false, filterable: false, sortable: false, aliases: [], ...extra })

const invoices = {
  name: 'invoices',
  table: { schema: 'sales', name: 'invoices' },
  primaryKey: ['id'],
  fields: { id: field('id', 'text', { readOnly: true }), number: field('number', 'text'), status: field('status', 'enum', { enumValues: ['draft', 'sent'] }) },
} as unknown as ResourceModel

const invoiceLines = {
  name: 'invoiceLines',
  table: { schema: 'sales', name: 'invoice_lines' },
  primaryKey: ['id'],
  fields: {
    id: field('id', 'text', { readOnly: true }),
    invoiceId: field('invoiceId', 'relation', { relation: { resource: 'invoices', columns: ['invoice_id'] } }),
    position: field('position', 'integer', { sortable: true }),
    description: field('description', 'text'),
    quantity: field('quantity', 'integer'),
    unitPrice: field('unitPrice', 'decimal'),
  },
} as unknown as ResourceModel

const view = (resource: string, extra: object) => ({ resource, fields: {}, filters: [], layout: [], actions: [], ...extra }) as unknown as ViewModel

const lines = ['Line A', 'Line B', 'Line C'].map((description, index) => ({ id: `l${index + 1}`, invoiceId: 'i1', position: index + 1, description, quantity: index + 1, unitPrice: '10.00', etag: `"l${index + 1}-v1"` }))

export type FakeInvoiceClient = { client: Client; batches: BatchOp[][] }

/** A server with one invoice and three lines; `batchWrite` records what Save sends, or fails the way you say. */
export const fakeInvoiceClient = ({ failBatch }: { failBatch?: () => Error } = {}): FakeInvoiceClient => {
  const batches: BatchOp[][] = []
  const client = {
    meta: async () => ({
      status: 'modified' as const,
      etag: '"meta"',
      meta: {
        resources: [invoices, invoiceLines],
        views: [
          view('invoices', { names: { singular: 'Invoice', plural: 'Invoices' }, fields: { status: { valueLabels: { draft: 'Draft', sent: 'Sent' } } }, list: { columns: ['number'] }, layout: [{ kind: 'section', title: 'Details', fields: ['number', 'status'] }] }),
          view('invoiceLines', { names: { singular: 'Invoice line', plural: 'Invoice lines' }, nav: { hidden: true } }),
        ],
        permissions: {},
      },
    }),
    get: async () => ({ record: { id: 'i1', number: 'INV-1', status: 'draft' }, etag: '"v1"' }),
    list: async (resource: string) => ({ items: resource === 'invoiceLines' ? lines : [{ id: 'i1', number: 'INV-1', status: 'draft', etag: '"v1"' }], nextPageToken: '', totalSizeEstimate: 3 }),
    batchWrite: async (ops: BatchOp[]) => {
      batches.push(ops)
      if (failBatch) throw failBatch()
      return { results: [] }
    },
  } as unknown as Client
  return { client, batches }
}
