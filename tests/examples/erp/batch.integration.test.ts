import { sql } from 'kysely'
import { SignJWT } from 'jose'
import { afterAll, describe, expect, it } from 'vitest'
import { configExports, createAdmin, jwtAuthenticator } from '@protobase/server'
import * as config from '../../../examples/erp/config'
import { roles } from '../../../examples/erp/config/roles'
import { createDb } from '../../../examples/erp/db/kysely'
import { databaseReachable } from './reachable'

const reachable = await databaseReachable()
const db = createDb(4)
afterAll(async () => { await db.destroy() })

const secret = new TextEncoder().encode('batch-test-secret-batch-test-secret-1234')
const token = await new SignJWT({ roles: ['admin'], tenant: 1 }).setProtectedHeader({ alg: 'HS256' }).setSubject('5').setExpirationTime('15m').sign(secret)
const { resources, views } = configExports(config)
const app = createAdmin({ resources, views, db, authenticate: jwtAuthenticator({ keys: async () => secret, algorithms: ['HS256'] }), options: { roles } })

const send = async (path: string, init: { method?: string; body?: unknown } = {}) => {
  const response = await app.request(path, {
    method: init.method ?? 'GET',
    headers: { authorization: `Bearer ${token}`, ...(init.body !== undefined && { 'content-type': 'application/json' }) },
    ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
  })
  return { status: response.status, json: (await response.json()) as any, headers: response.headers }
}
const batch = (operations: unknown[]) => send('/api/v1:batchWrite', { method: 'POST', body: { ops: operations } })
const etagOf = async (path: string) => (await send(`/api/v1${path}`)).headers.get('etag')!

type Line = { id: string; position: number; quantity: number }
const snapshot = async (invoice: string) => {
  const lines = (await sql<Line>`select id::text as id, position, quantity from sales.invoice_lines where invoice_id = ${invoice} order by id`.execute(db)).rows
  const header = (await sql<{ vat_rate: string; subtotal: string; total: string }>`select vat_rate::text, subtotal::text, total::text from sales.invoices where id = ${invoice}`.execute(db)).rows[0]!
  return { lines, header }
}

// Puts back the header's VAT rate and every line's position and quantity; positions go through negatives because
// (invoice_id, position) is unique and checked row by row.
const restoreBySql = (invoice: string, original: Awaited<ReturnType<typeof snapshot>>) =>
  db.transaction().execute(async (trx) => {
    await sql`update sales.invoices set vat_rate = ${original.header.vat_rate} where id = ${invoice}`.execute(trx)
    await sql`update sales.invoice_lines set position = -position where invoice_id = ${invoice}`.execute(trx)
    for (const line of original.lines) await sql`update sales.invoice_lines set position = ${line.position}, quantity = ${line.quantity} where id = ${line.id}`.execute(trx)
  })

describe.skipIf(!reachable)('POST /api/v1:batchWrite against the real invoice tables', async () => {
  const picked = reachable
    ? (await sql<{ invoice_id: string }>`select invoice_id::text from sales.invoice_lines where organization_id = 1 group by invoice_id having count(*) >= 3 limit 1`.execute(db)).rows[0]
    : undefined
  const invoice = picked?.invoice_id ?? '0'

  it('updates an invoice and its lines and swaps two positions under the real unique constraint, then restores them', async () => {
    const original = await snapshot(invoice)
    const [first, second, third] = [...original.lines].sort((a, b) => a.position - b.position)
    const lineEtags = async () => Object.fromEntries(await Promise.all(original.lines.map(async (line) => [line.id, await etagOf(`/invoiceLines/${line.id}`)])))

    const etags = await lineEtags()
    let restored = false
    try {
      const changed = await batch([
        { op: 'update', resource: 'invoices', key: invoice, etag: await etagOf(`/invoices/${invoice}`), data: { vatRate: '9' } },
        { op: 'update', resource: 'invoiceLines', key: third!.id, etag: etags[third!.id], data: { quantity: third!.quantity + 1 } },
        { op: 'reorder', resource: 'invoiceLines', field: 'position', keys: [second!.id, first!.id, ...original.lines.filter((line) => line !== first && line !== second).map((line) => line.id)], etags },
      ])
      expect(changed.status, JSON.stringify(changed.json)).toBe(200)
      const after = await snapshot(invoice)
      expect(after.header.vat_rate).toBe('9.00')
      expect(after.lines.find((line) => line.id === third!.id)!.quantity).toBe(third!.quantity + 1)
      expect(after.lines.find((line) => line.id === first!.id)!.position).toBe(2)
      expect(after.lines.find((line) => line.id === second!.id)!.position).toBe(1)

      // Restore through a second batch, with the ETags the first one returned
      const [vatEtag, thirdEtag, moved] = [changed.json.results[0].etag, changed.json.results[1].etag, changed.json.results[2].records]
      const restoring = await batch([
        { op: 'update', resource: 'invoices', key: invoice, etag: vatEtag, data: { vatRate: original.header.vat_rate } },
        { op: 'update', resource: 'invoiceLines', key: third!.id, etag: thirdEtag, data: { quantity: third!.quantity } },
        { op: 'reorder', resource: 'invoiceLines', field: 'position', keys: original.lines.map((line) => line.id).sort((a, b) => original.lines.find((l) => l.id === a)!.position - original.lines.find((l) => l.id === b)!.position), etags: Object.fromEntries(moved.map((r: { record: { id: string }; etag: string }) => [r.record.id, r.etag])) },
      ])
      expect(restoring.status, JSON.stringify(restoring.json)).toBe(200)
      expect(await snapshot(invoice)).toEqual(original)
      restored = true
    } finally {
      // A failure before the restoring batch would leave VAT 9, a quantity + 1 and two swapped lines for later tests.
      if (!restored) await restoreBySql(invoice, original)
    }
  })

  it('rolls back everything when a later operation violates a database check', async () => {
    const before = await snapshot(invoice)
    const line = before.lines[0]!
    const response = await batch([
      { op: 'update', resource: 'invoices', key: invoice, etag: '*', data: { vatRate: '6' } },
      { op: 'update', resource: 'invoiceLines', key: line.id, etag: '*', data: { quantity: 0 } },
    ])
    expect(response.status).toBe(400)
    expect(response.json).toMatchObject({ operation: 1, resource: 'invoiceLines', type: 'urn:protobase:problem:invalid-record' })
    expect(await snapshot(invoice)).toEqual(before)
  })
})
