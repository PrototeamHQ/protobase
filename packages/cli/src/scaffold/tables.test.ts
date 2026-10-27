import { describe, expect, it } from 'vitest'
import type { DbColumn, DbTable } from '../db/model'
import { scaffoldTables } from './tables'

const column = (name: string) => ({ name, position: 1, typeName: 'text', formatted: 'text', isEnum: false, enumValues: [], notNull: true, identity: false, identityAlways: false, generated: false }) as DbColumn
const primary = (name: string) => ({ name: `${name}_pkey`, columns: ['id'], unique: true, primary: true, partial: false, method: 'btree', opclasses: ['text_ops'] })

const table = (schema: string, name: string, columns = ['id']): DbTable =>
  ({ schema, name, kind: 'table', columns: columns.map(column), foreignKeys: [], checks: [], indexes: [primary(name)] })

describe('scaffoldTables', () => {
  it('lists the tables scaffold writes resources over, by schema and name, with their number of columns', () => {
    const { tables, skipped, supabaseSchemas } = scaffoldTables([table('shop', 'orders', ['id', 'total']), table('crm', 'customers')])
    expect(tables).toEqual([
      { schema: 'crm', name: 'customers', columns: 1, references: [] },
      { schema: 'shop', name: 'orders', columns: 2, references: [] },
    ])
    expect(skipped).toEqual([])
    expect(supabaseSchemas).toEqual([])
  })

  it('names the tables among them each one points to, once', () => {
    const key = (refTable: string) => ({ columns: ['id'], refSchema: 'shop', refTable, refColumns: ['id'] })
    const lines = { ...table('shop', 'order_lines'), foreignKeys: [key('orders'), key('orders'), key('products'), { ...key('user'), refSchema: 'auth' }] }
    const { tables } = scaffoldTables([table('shop', 'orders'), lines, table('auth', 'user'), table('auth', 'session')])
    expect(tables.find((each) => each.name === 'order_lines')!.references).toEqual(['shop.orders'])
  })

  it('says why it leaves out a view, a table without a key and the auth store', () => {
    const logs = { ...table('public', 'logs'), indexes: [] }
    const totals = { ...table('public', 'order_totals'), kind: 'view' as const, indexes: [] }
    const store = [table('auth', 'user'), table('auth', 'session')]
    const { tables, skipped } = scaffoldTables([table('public', 'orders'), logs, totals, ...store])
    expect(tables.map((each) => each.name)).toEqual(['orders'])
    expect(skipped).toEqual(['public.order_totals: a view', 'public.logs: no primary key or unique NOT NULL index', "schema auth: Protobase's auth store"])
  })

  // GoTrue's auth.users and the rest, Storage's tables and a platform service's, beside the app's own.
  const supabase = [
    table('auth', 'users'),
    table('auth', 'sessions'),
    table('auth', 'identities'),
    table('storage', 'buckets'),
    table('storage', 'objects'),
    table('realtime', 'messages'),
    table('supabase_migrations', 'schema_migrations'),
    { ...table('public', 'profiles'), foreignKeys: [{ columns: ['id'], refSchema: 'auth', refTable: 'users', refColumns: ['id'] }] },
  ]

  it("on a Supabase database, leaves out Supabase's auth schema as Supabase Auth's, never as Protobase's auth store", () => {
    const { tables, skipped, supabaseSchemas } = scaffoldTables(supabase, true)
    expect(tables).toEqual([{ schema: 'public', name: 'profiles', columns: 1, references: [] }])
    expect(skipped).toEqual([
      "schema auth: Supabase Auth's own tables",
      "schema realtime: Supabase's platform's own tables",
      "schema storage: Supabase Storage's own tables",
      "schema supabase_migrations: Supabase's platform's own tables",
    ])
    expect(supabaseSchemas).toEqual(['auth', 'realtime', 'storage', 'supabase_migrations'])
  })

  it("on any other database, takes auth for Protobase's auth store", () => {
    const { tables, skipped } = scaffoldTables(supabase)
    expect(skipped).toContain("schema auth: Protobase's auth store")
    expect(tables.map((each) => `${each.schema}.${each.name}`)).toContain('storage.objects')
  })
})
