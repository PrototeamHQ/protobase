import type { FieldModel, ResourceModel, ViewModel } from '@protobase/schema'

// A small copy of the ERP's sales data (companies, orders, invoices) for the "sales overview" guide and its stories.

const field = (name: string, type: FieldModel['type'], extra: Partial<FieldModel> = {}): FieldModel => ({
  name,
  column: name,
  type,
  nullable: false,
  readOnly: false,
  filterable: true,
  sortable: true,
  aliases: [],
  ...extra,
})

const model = (name: string, schema: string, fields: FieldModel[]): ResourceModel => ({
  name,
  table: { schema, name },
  primaryKey: ['id'],
  fields: Object.fromEntries(fields.map((entry) => [entry.name, entry])),
})

const company = { relation: { resource: 'companies', columns: ['company_id'] } }

export const salesResources: ResourceModel[] = [
  model('companies', 'crm', [
    field('id', 'integer', { readOnly: true }),
    field('name', 'text'),
    field('city', 'text'),
    field('email', 'text', { nullable: true }),
    field('phone', 'text', { nullable: true }),
    field('status', 'enum', { enumValues: ['lead', 'active', 'dormant'], default: { value: 'active' } }),
    field('createdAt', 'timestamp', { readOnly: true }),
  ]),
  model('orders', 'sales', [
    field('id', 'integer', { readOnly: true }),
    field('number', 'text'),
    field('companyId', 'relation', company),
    field('status', 'enum', { enumValues: ['draft', 'confirmed', 'shipped', 'delivered', 'cancelled'] }),
    field('total', 'decimal', { readOnly: true }),
    field('paid', 'boolean'),
    field('createdAt', 'timestamp', { readOnly: true }),
  ]),
  model('invoices', 'sales', [
    field('id', 'integer', { readOnly: true }),
    field('number', 'text'),
    field('companyId', 'relation', company),
    field('status', 'enum', { enumValues: ['draft', 'sent', 'paid', 'overdue'] }),
    field('issuedAt', 'date'),
    field('dueAt', 'date'),
    field('total', 'decimal', { readOnly: true }),
  ]),
]

const view = (resource: string, extra: Partial<ViewModel>): ViewModel => ({ resource, fields: {}, filters: [], layout: [], actions: [], ...extra })

const euro = { prefix: '€', decimals: 2 }

export const salesViews: ViewModel[] = [
  view('companies', { names: { singular: 'Company', plural: 'Companies' }, title: 'name', fields: { status: { valueLabels: { lead: 'Lead', active: 'Active', dormant: 'Dormant' } } }, list: { columns: ['name', 'city', 'status'] } }),
  view('orders', {
    names: { singular: 'Order', plural: 'Orders' },
    title: 'number',
    fields: { total: euro, companyId: { label: 'Customer' }, status: { valueLabels: { draft: 'Draft', confirmed: 'Confirmed', shipped: 'Shipped', delivered: 'Delivered', cancelled: 'Cancelled' } } },
    list: { columns: ['number', 'companyId', 'status', 'total'] },
    actions: [{ name: 'markPaid', label: 'Mark as paid', bulk: false, confirm: 'Record that the customer paid this order?', run: { kind: 'update', values: { paid: true } } }],
  }),
  view('invoices', {
    names: { singular: 'Invoice', plural: 'Invoices' },
    title: 'number',
    fields: { total: euro, companyId: { label: 'Customer' }, dueAt: { label: 'Due date' }, status: { valueLabels: { draft: 'Draft', sent: 'Sent', paid: 'Paid', overdue: 'Overdue' } } },
    list: { columns: ['number', 'companyId', 'status', 'total'] },
    actions: [
      { name: 'send', label: 'Send to customer', bulk: false },
      { name: 'recordPayment', label: 'Record payment', bulk: false, run: { kind: 'update', values: { status: 'paid' } } },
    ],
  }),
]

const companies = [
  ['Veldhuis Bouw', 'Utrecht', 'active'],
  ['Brandt Logistik', 'Bremen', 'active'],
  ['Hollis & Rowe', 'Leeds', 'dormant'],
  ['De Groene Tafel', 'Gouda', 'lead'],
  ['Kessler Feinmechanik', 'Kassel', 'lead'],
  ['Northgate Studio', 'York', 'lead'],
].map(([name, city, status], index) => ({ id: index + 1, name, city, status, email: `info@${name!.toLowerCase().replace(/[^a-z]+/g, '')}.example`, phone: null, createdAt: `2026-0${9 - (index % 3)}-1${index}T09:00:00Z` }))

const orders = [
  ['draft', 1, '1240.00', false],
  ['draft', 2, '310.50', false],
  ['confirmed', 1, '980.00', false],
  ['shipped', 2, '4520.00', false],
  ['delivered', 3, '12650.00', false],
  ['delivered', 1, '2210.00', false],
  ['delivered', 2, '760.00', true],
  ['delivered', 1, '1890.00', true],
  ['cancelled', 3, '150.00', false],
].map(([status, companyId, total, paid], index) => ({ id: index + 1, number: `SO-${2041 + index}`, companyId, status, total, paid, createdAt: `2026-10-0${(index % 7) + 1}T10:00:00Z` }))

const invoices = ([
  ['overdue', 3, '2026-07-02', '12650.00'],
  ['overdue', 1, '2026-08-14', '2210.00'],
  ['overdue', 2, '2026-08-30', '760.00'],
  ['sent', 1, '2026-09-20', '1890.00'],
  ['paid', 2, '2026-06-11', '4100.00'],
  ['paid', 1, '2026-05-03', '980.00'],
  ['draft', 2, '2026-10-05', '4520.00'],
] as Array<[string, number, string, string]>).map(([status, companyId, issuedAt, total], index) => ({ id: index + 1, number: `INV-${1101 + index}`, companyId, status, issuedAt, dueAt: issuedAt.replace(/-(\d\d)-/, (_, month: string) => `-${String(Number(month) + 1).padStart(2, '0')}-`), total }))

export const salesRows = { companies, orders, invoices }
