import { Kysely } from 'kysely'
import { PGliteDialect } from 'kysely-pglite-dialect'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type Meta } from '@protobase/client'
import { defineRoles, f, resource, view } from '@protobase/schema'
import { createAdmin } from '@protobase/server'
import { createInlinePort } from '../../packages/ui/src/app/export/builder-port'
import { defaultExportColumns, exportableFields, exportColumns } from '../../packages/ui/src/app/export/export-options'
import { runExport } from '../../packages/ui/src/app/export/run-export'
import type { ExportSink } from '../../packages/ui/src/app/export/sink'
import { createEmptyPg } from '../../test-support/pglite-snapshot'
import { as, testAuthenticator } from '../../test-support/server'

const roles = defineRoles<'customers' | 'invoices'>({
  admin: ['*'],
  // Reads the invoices of the north, without what they cost the company
  north: ['customers.read', { 'invoices.read': { fields: ['id', 'number', 'customerId', 'region', 'total', 'paid', 'issuedOn', 'iban'], filter: 'region = "north"' } }],
})

const customers = resource('customers').table('customers').fields({ id: f.integer().readOnly().sortable(), name: f.text() }).primaryKey((r) => r.id)

const invoices = resource('invoices')
  .table('invoices')
  .fields({
    id: f.integer().readOnly().sortable(),
    number: f.text(),
    customerId: f.relation('customers'),
    region: f.enum(['north', 'south']).filterable(),
    total: f.decimal({ precision: 10, scale: 2 }),
    cost: f.decimal({ precision: 10, scale: 2 }),
    paid: f.boolean(),
    issuedOn: f.date(),
    iban: f.text().sensitive(),
  })
  .primaryKey((r) => r.id)

const invoicesView = view<typeof invoices>('invoices')
  .names({ singular: 'Invoice', plural: 'Invoices' })
  .list((r) => ({ columns: [r.number, r.customerId, r.region, r.total, r.cost, r.paid, r.issuedOn] }))
  .fields((r) => ({ region: r.region.valueLabels({ north: 'North', south: 'South' }), total: r.total.prefix('€').decimals(2), customerId: r.customerId.label('Customer') }))

const customersView = view<typeof customers>('customers').title((r) => r.name)

const strFromBytes = (bytes: Uint8Array) => new TextDecoder().decode(bytes)

const collect = () => {
  const chunks: Uint8Array[] = []
  const sink: ExportSink = { write: async (bytes) => void chunks.push(bytes), close: async () => undefined, abort: async () => undefined }
  const bytes = () => {
    const all = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.length, 0))
    chunks.reduce((offset, chunk) => (all.set(chunk, offset), offset + chunk.length), 0)
    return all
  }
  return { sink, bytes }
}

// An export reads its rows as the list does, through the API as the user: the role's row filter, readable fields and
// sensitive fields decide what the file holds, whatever the page asks for.
describe('exporting a list through the API', () => {
  let db: Kysely<any>
  let app: ReturnType<typeof createAdmin>

  beforeAll(async () => {
    const pg = await createEmptyPg()
    await pg.exec(`
      create table customers (id integer generated always as identity primary key, name text not null);
      insert into customers (name) values ('Acme'), ('Globex');
      create table invoices (
        id integer generated always as identity primary key, number text not null, customer_id integer not null references customers (id),
        region text not null, total numeric(10, 2) not null, cost numeric(10, 2) not null, paid boolean not null, issued_on date not null, iban text not null
      );
      insert into invoices (number, customer_id, region, total, cost, paid, issued_on, iban)
        select 'INV-' || lpad(n::text, 4, '0'), 1 + n % 2, case when n % 4 = 0 then 'south' else 'north' end, n + 0.5, n, n % 3 = 0, date '2026-01-01' + n, 'NL00BANK' || n
        from generate_series(1, 1600) as n;
      create index on invoices (region);
    `)
    db = new Kysely({ dialect: new PGliteDialect(pg) })
    app = createAdmin({ resources: [customers, invoices], views: [invoicesView, customersView], db, authenticate: testAuthenticator, options: { roles } })
  })
  afterAll(async () => {
    await db.destroy()
  })

  const signedIn = (role: string) => createClient({ baseUrl: 'http://app.test/api/v1', fetch: (async (input: RequestInfo | URL, init?: RequestInit) => app.request(String(input), init)) as typeof fetch, headers: () => as(undefined, role) })

  const exportAs = async (role: string, format: 'csv' | 'xlsx', limit = Infinity) => {
    const client = signedIn(role)
    const result = await client.meta()
    if (result.status !== 'modified') throw new Error('Expected /meta')
    const { resources, views } = result.meta as Meta
    const model = resources.find((resource) => resource.name === 'invoices')!
    const shown = views.find((candidate) => candidate.resource === 'invoices')
    const { sink, bytes } = collect()
    const progress: number[] = []
    const outcome = await runExport({
      client,
      resource: 'invoices',
      filters: [''],
      orderBy: 'id',
      plan: { format, mode: 'shown', name: 'Invoices', columns: exportColumns(model, shown, defaultExportColumns(model, shown)) },
      labels: { customerId: 'name' },
      limit,
      port: createInlinePort(),
      sink,
      signal: new AbortController().signal,
      onProgress: (rows) => progress.push(rows),
    })
    return { outcome, progress, bytes: bytes(), fields: exportableFields(model) }
  }

  it("holds the rows and fields the role may read, page by page, as the list shows them", async () => {
    const { outcome, progress, bytes, fields } = await exportAs('north', 'csv')
    expect(fields).not.toContain('cost')
    expect(fields).not.toContain('iban')
    expect(outcome).toEqual({ rows: 1200, truncated: false })
    expect(progress).toEqual([500, 1000, 1200])
    const lines = strFromBytes(bytes.slice(3)).split('\r\n')
    expect(lines[0]).toBe('Number,Customer,Region,Total,Paid,Issued on')
    expect(lines[1]).toBe('INV-0001,Globex,North,€1.50,No,2 Jan 2026')
    expect(lines.filter((line) => line.includes(',South,'))).toEqual([])
    expect(lines).toHaveLength(1202)
  })

  it('stops at the limit and says more matched', async () => {
    const { outcome } = await exportAs('admin', 'xlsx', 700)
    expect(outcome).toEqual({ rows: 700, truncated: true })
  })

  it('builds a workbook in the same pages', async () => {
    const { outcome, progress, bytes } = await exportAs('admin', 'xlsx')
    expect(outcome).toEqual({ rows: 1600, truncated: false })
    expect(progress).toEqual([500, 1000, 1500, 1600])
    // A zip file, as every .xlsx is
    expect(strFromBytes(bytes.slice(0, 2))).toBe('PK')
  })
})
