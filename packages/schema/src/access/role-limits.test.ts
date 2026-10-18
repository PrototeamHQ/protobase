import { describe, expect, it } from 'vitest'
import { f } from '../fields'
import { resource } from '../resource'
import { restrictModel } from './restrict'
import { checkRecord, resolveAccess } from './resolve'
import { defineRoles } from './roles'

const products = (screening = f.text()) =>
  resource('products')
    .table('shop.products')
    .fields({
      id: f.integer().readOnly(),
      sku: f.text(),
      name: f.text(),
      price: f.decimal({ precision: 10, scale: 2 }),
      cost_price: f.decimal({ precision: 10, scale: 2 }),
      stock: f.integer(),
      published: f.boolean(),
      owner_id: f.text(),
      screening,
    })
    .primaryKey((r) => r.id)
    .owner((r) => r.owner_id)

const roles = defineRoles<'products' | 'orders'>({
  admin: ['*'],
  editor: ['products.read', 'products.update'],
  erp_sync: [{ 'products.read': ['sku', 'price', 'stock'] }, { 'products.update': ['stock'] }],
  pricing: [{ 'products.read': ['sku', 'cost_price'] }],
  reseller: [{ 'products.read': { fields: ['sku', 'name', 'price'], filter: 'published = true' } }],
  outlet: [{ 'products.read': { filter: 'stock > 0' } }],
  anonymous: [{ 'products.read': { fields: ['name', 'price', 'screening'], filter: 'published = true' } }],
})

const as = (...names: string[]) => ({ user: { id: 'u1', roles: names } })
const resolve = (names: string[], source = products()) => resolveAccess(source, as(...names), { roles })

describe('defining limited capabilities', () => {
  it('parses field lists and filters, and lists the limited capabilities', () => {
    expect(roles.limits.map(({ role, capability, fields }) => [role, capability, fields])).toEqual([
      ['erp_sync', 'products.read', ['sku', 'price', 'stock']],
      ['erp_sync', 'products.update', ['stock']],
      ['pricing', 'products.read', ['sku', 'cost_price']],
      ['reseller', 'products.read', ['sku', 'name', 'price']],
      ['outlet', 'products.read', undefined],
      ['anonymous', 'products.read', ['name', 'price', 'screening']],
    ])
    expect(roles.limits.find(({ role }) => role === 'outlet')?.filter).toMatchObject({ kind: 'compare', op: '>' })
  })

  it('rejects limits that do not fit one resource and action', () => {
    expect(() => defineRoles({ x: [{ '*.read': ['sku'] }] })).toThrow('name it instead of "*"')
    expect(() => defineRoles({ x: [{ 'products.delete': ['sku'] }] })).toThrow('fields apply to read, create, update')
    expect(() => defineRoles({ x: [{ 'products.*': ['sku'] }] })).toThrow('fields apply to')
    expect(() => defineRoles({ x: [{ 'products.read': {} }] })).toThrow('to nothing')
    expect(() => defineRoles({ x: [{ 'products.read': { columns: ['sku'] } as never }] })).toThrow('with "columns"')
    expect(() => defineRoles({ x: [{ 'products.read': { filter: 'published = ' } }] })).toThrow('invalid filter "published = "')
    expect(() => defineRoles({ x: [{ 'products.fly': ['sku'] } as never] })).toThrow('Invalid capability')
    expect(() => defineRoles({ x: [{ 'nope.read': ['sku'] }] }, { names: ['products'] })).toThrow('"nope" is not a known resource or area')
    expect(defineRoles({ x: [{ 'products.delete': { filter: 'stock = 0' } }] }).limits).toHaveLength(1)
  })

  it('checks capability names in entries at compile time', () => {
    const compileTime = () => {
      // @ts-expect-error unknown resource
      defineRoles<'products'>({ x: [{ 'nope.read': ['sku'] }] })
      // @ts-expect-error unknown action
      defineRoles<'products'>({ x: [{ 'products.fly': ['sku'] }] })
    }
    expect(compileTime).toBeTypeOf('function')
  })

  it('lets the anonymous role only read listed fields of named resources', () => {
    expect(() => defineRoles({ anonymous: ['products.read'] })).toThrow("must list the fields it reads: { 'products.read'")
    expect(() => defineRoles({ anonymous: [{ 'products.update': ['stock'] }] })).toThrow('may only read, or create through a public form, but it grants "products.update"')
    expect(() => defineRoles({ anonymous: [{ 'products.read': { filter: 'published = true' } }] })).toThrow('must list the fields')
    expect(() => defineRoles({ anonymous: ['*.read'] })).toThrow('must name each resource')
    expect(() => defineRoles({ anonymous: [{ 'products.read.own': ['name'] }] })).toThrow('owns no rows')
  })

  it('lets the anonymous role create listed fields of named resources, for public forms', () => {
    expect(defineRoles({ anonymous: [{ 'products.create': ['name', 'price'] }] }).limits).toEqual([{ role: 'anonymous', capability: 'products.create', fields: ['name', 'price'] }])
    expect(() => defineRoles({ anonymous: ['products.create'] })).toThrow("must list the fields it creates: { 'products.create'")
    expect(() => defineRoles({ anonymous: ['*.create'] })).toThrow('must name each resource it creates')
    expect(() => defineRoles({ anonymous: [{ 'products.create.own': ['name'] }] })).toThrow('owns no rows')
    expect(() => defineRoles({ anonymous: [{ 'products.update': ['stock'] }] })).toThrow('or create through a public form, but it grants "products.update"')
  })
})

describe('resolving field lists', () => {
  it('limits readable and writable fields to the lists; key columns stay through restrictModel', async () => {
    const access = await resolve(['erp_sync'])
    expect(access.operations).toMatchObject({ read: true, list: true, update: true, create: false })
    expect(access.readableFields).toEqual(['sku', 'price', 'stock'])
    expect(access.writableFields).toEqual({ create: [], update: ['stock'] })
    const restricted = restrictModel(products().toModel(), access)
    expect(Object.keys(restricted.fields)).toEqual(['id', 'sku', 'price', 'stock'])
    expect(restricted.fields.price!.readOnly).toBe(true)
    expect(restricted.fields.stock!.readOnly).toBe(false)
  })

  it('unions lists across roles, and a plain capability allows every field', async () => {
    expect((await resolve(['erp_sync', 'pricing'])).readableFields).toEqual(['sku', 'price', 'cost_price', 'stock'])
    const both = await resolve(['erp_sync', 'editor'])
    expect(both.readableFields).toHaveLength(9)
    expect(both.writableFields.update).toEqual(['sku', 'name', 'price', 'cost_price', 'stock', 'published', 'owner_id', 'screening'])
    expect((await resolve(['editor'])).readableFields).toHaveLength(9)
  })

  it('keeps field rules: a field is readable when the list allows it and its rule passes', async () => {
    const guarded = products(f.text().access({ read: roles.is('admin') }))
    expect((await resolve(['anonymous'], guarded)).readableFields).toEqual(['name', 'price'])
    expect((await resolve(['admin'], guarded)).readableFields).toContain('screening')
  })

  it('leaves resources without a listed capability to their rules', async () => {
    const open = products().access({ read: () => true })
    expect((await resolve(['editor'], open)).readableFields).toHaveLength(9)
    expect((await resolve(['erp_sync'], open)).readableFields).toEqual(['sku', 'price', 'stock'])
  })
})

describe('row filters on capabilities', () => {
  it('ANDs the filter with the grant, and ORs it with other roles', async () => {
    const reseller = await resolve(['reseller'])
    expect(reseller.rowFilter.read).toMatchObject({ kind: 'compare', field: { name: 'published' } })
    expect(reseller.readableFields).toEqual(['sku', 'name', 'price'])
    const outlet = await resolve(['outlet'])
    expect(outlet.readableFields).toHaveLength(9)
    expect((await resolve(['reseller', 'outlet'])).rowFilter.read).toMatchObject({ kind: 'or' })
    expect((await resolve(['reseller', 'editor'])).rowFilter.read).toBeUndefined()
  })

  it('applies where roles.can decides, beside .own', async () => {
    const scoped = defineRoles({ seller: [{ 'products.read.own': { filter: 'published = true' } }] })
    const source = products().access({ read: scoped.can('products.read') })
    const access = await resolveAccess(source, as('seller'))
    expect(access.rowFilter.read).toMatchObject({ kind: 'and', args: [{ field: { name: 'owner_id' } }, { field: { name: 'published' } }] })
    expect(await checkRecord(source, as('seller'), 'read', { owner_id: 'u1', published: true })).toBe(true)
    expect(await checkRecord(source, as('seller'), 'read', { owner_id: 'u1', published: false })).toBe(false)
  })
})

describe('the anonymous role', () => {
  it('reads listed fields of filtered rows, and nothing else', async () => {
    const access = await resolve(['anonymous'])
    expect(access.operations).toEqual({ read: true, list: true, create: false, update: false, delete: false })
    expect(access.readableFields).toEqual(['name', 'price', 'screening'])
    expect(access.rowFilter.read).toMatchObject({ field: { name: 'published' } })
  })

  it('needs its capability even where an explicit rule or defaultAccess would allow anyone', async () => {
    const open = products().access({ read: () => true, update: () => true })
    const access = await resolve(['anonymous'], open)
    expect(access.operations).toMatchObject({ read: true, update: false })
    expect(access.rowFilter.read).toMatchObject({ field: { name: 'published' } })
    const orders = resource('orders').table('orders').fields({ id: f.integer() }).primaryKey((r) => r.id).access({ read: () => true })
    expect((await resolveAccess(orders, as('anonymous'), { roles })).operations.read).toBe(false)
    expect((await resolveAccess(products(), as('anonymous'), { roles, defaultAccess: 'allow' })).operations.update).toBe(false)
    expect(await checkRecord(open, as('anonymous'), 'read', { published: false }, undefined, { roles })).toBe(false)
    expect(await checkRecord(open, as('anonymous'), 'read', { published: true }, undefined, { roles })).toBe(true)
  })

  it('keeps the row filter when the explicit rule needs the record', async () => {
    const recordRule = products().access({ read: (_ctx, record) => (record as { stock: number }).stock > 0 })
    const access = await resolve(['anonymous'], recordRule)
    expect(access.recordChecks).toContain('read')
    expect(access.rowFilter.read).toMatchObject({ field: { name: 'published' } })
  })

  it('is an ordinary role name in a project that does not define it', async () => {
    const plain = defineRoles({ admin: ['*'] })
    const open = products().access({ read: () => true })
    expect((await resolveAccess(open, as('anonymous'), { roles: plain })).operations.read).toBe(true)
  })
})
