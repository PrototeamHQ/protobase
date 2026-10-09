import { describe, expect, it } from 'vitest'
import { f } from '../fields'
import { resource } from '../resource'
import { view } from '../view'
import { where } from '../filter'
import { restrictModel } from './restrict'
import { accessWarnings, checkRecord, fieldsUsedBy, resolveAccess } from './resolve'
import { defineRoles } from './roles'
import { pickView } from './pick-view'

const orders = (rules: Parameters<ReturnType<typeof base>['access']>[0] = {}) => base().access(rules)
const base = () =>
  resource('orders')
    .table('orders')
    .fields({
      id: f.integer().readOnly().filterable(),
      ownerId: f.integer().filterable(),
      status: f.enum(['draft', 'paid']).filterable(),
      cost: f.decimal({ precision: 10, scale: 2 }),
      margin: f.decimal({ precision: 10, scale: 2 }),
    })
    .primaryKey((r) => r.id)
    .owner((r) => r.ownerId)

const user = (id: number, ...roles: string[]) => ({ user: { id, roles } })

describe('capabilities', () => {
  const roles = defineRoles<'orders' | 'invoices' | 'costs'>({
    admin: ['*'],
    auditor: ['*.read'],
    sales: ['orders.read.own', 'orders.create', 'invoices.*'],
    lead: ['orders.read.team', 'costs.read.*'],
  })
  const scopes = (role: string, capability: Parameters<typeof roles.grants>[1]) => [...roles.grants({ roles: [role] }, capability)].sort()

  it('matches wildcards on resource, action and scope', () => {
    expect(scopes('admin', 'orders.delete')).toEqual(['all'])
    expect(scopes('auditor', 'orders.read')).toEqual(['all'])
    expect(scopes('auditor', 'orders.update')).toEqual([])
    expect(scopes('sales', 'invoices.delete')).toEqual(['all'])
    expect(scopes('sales', 'orders.create')).toEqual(['all'])
    expect(scopes('sales', 'orders.update')).toEqual([])
    expect(scopes('lead', 'costs.read')).toEqual(['all'])
  })

  it('narrows to own and team scopes and unions roles', () => {
    expect(scopes('sales', 'orders.read')).toEqual(['own'])
    expect(scopes('lead', 'orders.read')).toEqual(['team'])
    expect([...roles.grants({ roles: ['sales', 'lead'] }, 'orders.read')].sort()).toEqual(['own', 'team'])
    expect([...roles.grants({ roles: ['sales', 'auditor'] }, 'orders.read')]).toContain('all')
    expect(roles.grants({ roles: ['nobody'] }, 'orders.read').size).toBe(0)
    expect(roles.has({ roles: ['sales'] }, 'orders.read')).toBe(true)
    expect(roles.has({}, 'orders.read')).toBe(false)
  })

  it('rejects unknown names and shapes', () => {
    const compileTime = () => {
      // @ts-expect-error unknown resource
      defineRoles<'orders'>({ x: ['nope.read'] })
      // @ts-expect-error unknown action
      defineRoles<'orders'>({ x: ['orders.fly'] })
      // @ts-expect-error unknown scope
      defineRoles<'orders'>({ x: ['orders.read.mine'] })
      // @ts-expect-error unknown name in can()
      roles.can('nope.read')
    }
    expect(compileTime).toBeTypeOf('function')
    expect(() => defineRoles({ x: ['nope.read'] }, { names: ['orders'] })).toThrow('"nope" is not a known resource or area')
    expect(() => defineRoles({ x: ['orders.fly'] as never })).toThrow('Invalid capability')
    expect(() => roles.is('ghost')).toThrow('Unknown role')
  })
})

describe('resolveAccess', () => {
  const roles = defineRoles<'orders' | 'costs'>(
    {
      admin: ['*'],
      sales: ['orders.read.own', 'orders.create', 'orders.update.own'],
      lead: ['orders.read.team', 'costs.read'],
      clerk: ['orders.read'],
    },
    { teamOf: (user) => (user.id === 1 ? [1, 2, 3] : []) },
  )
  const rules = { read: roles.can('orders.read'), create: roles.can('orders.create'), update: roles.can('orders.update'), delete: roles.can('orders.delete') }

  it('turns .own into a row filter on the owner field', async () => {
    const access = await resolveAccess(orders(rules), user(7, 'sales'))
    expect(access.operations).toEqual({ list: true, read: true, create: true, update: true, delete: false })
    expect(access.rowFilter.read).toMatchObject({ kind: 'compare', op: '=', field: { name: 'ownerId' }, value: { kind: 'number', value: 7 } })
    expect(access.rowFilter.update).toMatchObject({ field: { name: 'ownerId' } })
    expect(access.rowFilter.create).toBeUndefined()
  })

  it('turns .team into an IN filter from teamOf, and denies an empty team', async () => {
    const lead = await resolveAccess(orders(rules), user(1, 'lead'))
    expect(lead.rowFilter.read).toMatchObject({ kind: 'in', field: { name: 'ownerId' }, values: [{ value: 1 }, { value: 2 }, { value: 3 }] })
    const alone = await resolveAccess(orders(rules), user(9, 'lead'))
    expect(alone.operations.read).toBe(false)
  })

  it('combines own and team grants with OR, and lets an unscoped grant win', async () => {
    const both = await resolveAccess(orders(rules), user(1, 'sales', 'lead'))
    expect(both.rowFilter.read).toMatchObject({ kind: 'or' })
    const wide = await resolveAccess(orders(rules), user(1, 'sales', 'clerk'))
    expect(wide.rowFilter.read).toBeUndefined()
    expect(wide.operations.read).toBe(true)
  })

  it('fails clearly when .own has no owner field', async () => {
    const noOwner = resource('x').table('x').fields({ id: f.integer() }).primaryKey((r) => r.id).access({ read: roles.can('orders.read') })
    await expect(resolveAccess(noOwner, user(1, 'sales'))).rejects.toThrow('has no .owner(...)')
  })

  it('unknown fields in .owner() are compile-time errors', () => {
    // @ts-expect-error unknown field
    expect(() => base().owner((r) => r.nope)).toThrow('Unknown field')
  })

  it('resolves readable and writable columns from role-based field rules', async () => {
    const source = resource('orders')
      .table('orders')
      .fields({
        id: f.integer().readOnly(),
        ownerId: f.integer(),
        cost: f.decimal({ precision: 10, scale: 2 }).access({ read: roles.can('costs.read'), update: roles.is('admin') }),
        total: f.decimal({ precision: 10, scale: 2 }).readOnly(),
      })
      .primaryKey((r) => r.id)
      .owner((r) => r.ownerId)
      .access(rules)
    const sales = await resolveAccess(source, user(7, 'sales'))
    expect(sales.readableFields).toEqual(['id', 'ownerId', 'total'])
    expect(sales.writableFields).toEqual({ create: ['ownerId', 'cost'], update: ['ownerId'] })
    const lead = await resolveAccess(source, user(1, 'lead'))
    expect(lead.readableFields).toEqual(['id', 'ownerId', 'cost', 'total'])
    expect(lead.writableFields).toEqual({ create: [], update: [] })
    const admin = await resolveAccess(source, user(1, 'admin'))
    expect(admin.writableFields.update).toEqual(['ownerId', 'cost'])
  })

  it('a field rule cannot return a row filter', async () => {
    const source = resource('orders').table('o').fields({ id: f.integer(), secret: f.text().access({ read: roles.can('orders.read') }) }).primaryKey((r) => r.id).owner((r) => r.id)
    await expect(resolveAccess(source, user(1, 'sales'))).rejects.toThrow('must be role-based')
  })

  it('no readable columns when reading is denied; defaultAccess controls resources without rules', async () => {
    const denied = await resolveAccess(orders(rules), user(1, 'nobody'))
    expect(denied.readableFields).toEqual([])
    expect(denied.writableFields).toEqual({ create: [], update: [] })
    expect((await resolveAccess(base(), user(1))).operations.delete).toBe(true)
    expect((await resolveAccess(base(), user(1), { defaultAccess: 'deny' })).operations.read).toBe(false)
  })

  it('reports which columns a filter touches', async () => {
    const access = await resolveAccess(orders(rules), user(7, 'sales'))
    expect(fieldsUsedBy(access.rowFilter.read!)).toEqual(['ownerId'])
  })
})

describe('combining rules and record checks', () => {
  const roles = defineRoles({ sales: ['orders.read.own', 'orders.update'], admin: ['*'] })

  it('and/or combine rules with plain functions, merging filters', async () => {
    const draftOnly = roles.can('orders.read').and(() => 'status = draft')
    const a = await resolveAccess(orders({ read: draftOnly }), user(7, 'sales'))
    expect(a.rowFilter.read).toMatchObject({ kind: 'and' })
    const either = roles.can('orders.read').or(() => where.eq('status', 'paid'))
    const b = await resolveAccess(orders({ read: either }), user(7, 'sales'))
    expect(b.rowFilter.read).toMatchObject({ kind: 'or' })
    const c = await resolveAccess(orders({ read: roles.is('admin').or(roles.can('orders.read')) }), user(7, 'admin'))
    expect(c.rowFilter.read).toBeUndefined()
    const d = await resolveAccess(orders({ read: roles.can('orders.update').and(() => false) }), user(7, 'sales'))
    expect(d.operations.read).toBe(false)
  })

  it('record-level rules are flagged and checked with the record and input', async () => {
    const source = orders({
      update: roles.can('orders.update').and((_, record) => (record as { status: string }).status === 'draft'),
      create: (_, __, input) => (input as { cost?: string }).cost === undefined || 'status = draft',
    })
    const access = await resolveAccess(source, user(7, 'sales'))
    expect(access.recordChecks).toEqual(['create', 'update'])
    expect(await checkRecord(source, user(7, 'sales'), 'update', { status: 'draft' })).toBe(true)
    expect(await checkRecord(source, user(7, 'sales'), 'update', { status: 'paid' })).toBe(false)
    expect(await checkRecord(source, user(7, 'sales'), 'create', undefined, { cost: '5', status: 'draft' })).toBe(true)
    expect(await checkRecord(source, user(7, 'sales'), 'create', undefined, { cost: '5', status: 'paid' })).toBe(false)
  })

  it('checks .own filters against the record', async () => {
    const source = orders({ read: roles.can('orders.read') })
    expect(await checkRecord(source, user(7, 'sales'), 'read', { ownerId: 7 })).toBe(true)
    expect(await checkRecord(source, user(7, 'sales'), 'read', { ownerId: 8 })).toBe(false)
    expect(await checkRecord(source, user(7, 'admin'), 'read', { ownerId: 8 })).toBe(true)
  })

  it('propagates errors that are not about a missing record', async () => {
    const source = orders({ read: () => { throw new Error('boom') } })
    await expect(resolveAccess(source, user(1))).rejects.toThrow('boom')
  })
})

describe('views per role', () => {
  const standard = view<ReturnType<typeof base>>('orders').toModel()
  const warehouse = view<ReturnType<typeof base>>('orders').forRoles(['warehouse']).toModel()
  const finance = view<ReturnType<typeof base>>('orders').forRoles(['accountant', 'manager']).toModel()

  it('picks the first matching view, else the default', () => {
    const views = [warehouse, finance, standard]
    expect(pickView(views, ['manager'])).toBe(finance)
    expect(pickView(views, ['sales', 'warehouse'])).toBe(warehouse)
    expect(pickView(views, ['sales'])).toBe(standard)
    expect(pickView([warehouse], ['sales'])).toBeUndefined()
    expect(pickView(views, ['manager'], 'other')).toBeUndefined()
    expect(warehouse.roles).toEqual(['warehouse'])
    expect(standard.roles).toBeUndefined()
  })
})

describe('default access', () => {
  const roles = defineRoles<'orders'>({ admin: ['*'], clerk: ['orders.read'] })

  it('with roles, operations without a rule need the capability; admin still passes', async () => {
    const clerk = await resolveAccess(base(), user(1, 'clerk'), { roles })
    expect(clerk.operations).toEqual({ list: true, read: true, create: false, update: false, delete: false })
    const admin = await resolveAccess(base(), user(1, 'admin'), { roles })
    expect(Object.values(admin.operations)).toEqual([true, true, true, true, true])
    const nobody = await resolveAccess(base(), user(1, 'ghost'), { roles })
    expect(nobody.readableFields).toEqual([])
    expect(await checkRecord(base(), user(1, 'clerk'), 'update', { id: 1 }, undefined, { roles })).toBe(false)
  })

  it('without roles it allows; allow with roles is an explicit opt-in with a warning', async () => {
    expect((await resolveAccess(base(), user(1))).operations.create).toBe(true)
    const open = await resolveAccess(base(), user(1, 'ghost'), { roles, defaultAccess: 'allow' })
    expect(open.operations.create).toBe(true)
    expect(accessWarnings({ roles, defaultAccess: 'allow' })).toHaveLength(1)
    expect(accessWarnings({ roles })).toEqual([])
    expect(accessWarnings({ defaultAccess: 'allow' })).toEqual([])
  })

  it('fields without a rule follow their resource', async () => {
    const clerk = await resolveAccess(base(), user(1, 'clerk'), { roles })
    expect(clerk.readableFields).toEqual(['id', 'ownerId', 'status', 'cost', 'margin'])
  })
})

describe('restrictModel', () => {
  const roles = defineRoles<'orders' | 'costs'>({ sales: ['orders.read.own', 'orders.update'], lead: ['orders.read', 'costs.read'] })
  const source = resource('orders')
    .table('orders')
    .fields({
      id: f.integer().readOnly().filterable().sortable(),
      ownerId: f.integer(),
      status: f.enum(['draft', 'paid']).filterable().sortable(),
      cost: f.decimal({ precision: 10, scale: 2 }).filterable().sortable().access({ read: roles.can('costs.read') }),
      total: f.decimal({ precision: 10, scale: 2 }).readOnly(),
    })
    .primaryKey((r) => r.id)
    .owner((r) => r.ownerId)
    .search((r) => [r.status, r.cost.digitsEnd()])
    .access({ read: roles.can('orders.read'), update: roles.can('orders.update') })

  it('keeps only readable fields, shrinks search, and reflects write access', async () => {
    const access = await resolveAccess(source, user(7, 'sales'))
    const restricted = restrictModel(source.toModel(), access)
    expect(Object.keys(restricted.fields)).toEqual(['id', 'ownerId', 'status', 'total'])
    expect(restricted.search).toEqual(['status'])
    expect(restricted).not.toHaveProperty('searchMatch')
    expect(restrictModel(source.toModel(), await resolveAccess(source, user(1, 'lead'))).searchMatch).toEqual({ cost: 'digitsEnd' })
    expect(restricted.fields.status!.readOnly).toBe(false)
    expect(restricted.fields.total!.readOnly).toBe(true)
    expect(restricted.fields.id!.readOnly).toBe(true)
    expect(restricted.owner).toBe('ownerId')
    expect(source.toModel().fields.cost).toBeDefined()
  })

  it('hidden fields cannot be referenced in checked filters, while row filters use the full model', async () => {
    const { parseFilter, checkFilter } = await import('../filter')
    const lead = await resolveAccess(source, user(1, 'lead'))
    const sales = await resolveAccess(source, user(7, 'sales'))
    const parsed = parseFilter('cost > 5')
    if (!parsed.ok || !parsed.ast) throw new Error('parse failed')
    expect(checkFilter(restrictModel(source.toModel(), lead), parsed.ast).ok).toBe(true)
    const hidden = checkFilter(restrictModel(source.toModel(), sales), parsed.ast)
    expect(hidden.ok ? [] : hidden.errors.map((e) => e.code)).toEqual(['unknown-field'])
    expect(sales.rowFilter.read).toMatchObject({ field: { name: 'ownerId' } })
  })

  it('drops tenant, soft-delete and owner fields that are hidden, but keeps key columns', () => {
    const model = source.toModel()
    const restricted = restrictModel(model, { readableFields: ['status'], writableFields: { create: [], update: [] } })
    expect(Object.keys(restricted.fields)).toEqual(['id', 'status'])
    expect(restricted.owner).toBeUndefined()
    expect(restricted.primaryKey).toEqual(['id'])
  })
})
