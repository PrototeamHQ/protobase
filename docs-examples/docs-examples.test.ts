import { describe, expect, it } from 'vitest'
import { checkRecord, keyTypes, resolveAccess, restrictModel, type ResourceModel } from '@protobase/schema'
import { customers, repairs } from './bike-shop/data'
import * as step5 from './bike-shop/step-5'
import { customerRows, repairRows } from './bike-shop/rows'
import { roles, workOrders } from './reference/access'
import * as catalog from './reference/catalog'
import * as workshop from './reference/workshop'
import * as invoiceItems from './reference/invoice-items'
import * as rankedBoard from './reference/ranked-board'
import { partOrders, stock } from './reference/keys'

// The documentation shows these files; this keeps what it says about them true.

const models: Record<string, ResourceModel> = Object.fromEntries([customers, repairs, stock, partOrders, workOrders].map((source) => [source.toModel().name, source.toModel()]))

describe('the bike shop', () => {
  it('describes its tables, leaving out the ignored column', () => {
    expect(models.repairs!.fields.notes!.column).toBe('internal_notes')
    expect(models.repairs!.fields).not.toHaveProperty('legacy_ref')
    expect(models.customers!.fields.country!.default).toEqual({ value: 'NL' })
  })

  it('has views whose fields exist, and a view for mechanics', () => {
    expect(step5.repairsView.toModel(models.repairs).actions.map((action) => action.name)).toEqual(['ready', 'collect', 'customerRepairs'])
    expect(step5.workshopRepairsView.toModel(models.repairs).roles).toEqual(['mechanic'])
    expect(step5.customersView.toModel(models.customers).title).toBe('name')
  })

  it('refuses a collected repair that is not paid', () => {
    const [validate] = repairs.validators
    expect(validate!({ ...repairRows[0]!, status: 'collected', paid: false } as never)).toEqual([{ field: 'paid', message: 'A bike leaves the shop paid' }])
    expect(validate!({ ...repairRows[0]!, status: 'collected', paid: true } as never)).toBeUndefined()
  })

  it('has rows the field schemas accept', () => {
    for (const row of customerRows) expect(customers.recordSchema().safeParse(row).success).toBe(true)
    for (const row of repairRows) expect(repairs.recordSchema().safeParse({ ...row, legacy_ref: undefined }).success).toBe(true)
  })
})

describe('access', () => {
  it("gives a mechanic their own work orders, without the labour's price", async () => {
    const access = await resolveAccess(workOrders, { user: { id: 'sem', roles: ['mechanic'] } })
    expect(access.operations).toMatchObject({ read: true, update: true, create: false, delete: false })
    expect(access.rowFilter.read).toBeDefined()
    expect(Object.keys(restrictModel(workOrders.toModel(), access).fields)).not.toContain('labour')
  })

  it('closes finished work orders to updates', async () => {
    const access = await resolveAccess(workOrders, { user: { id: 'pip', roles: ['desk'] } })
    expect(access.recordChecks).toContain('update')
    expect(await checkRecord(workOrders, { user: { id: 'pip', roles: ['desk'] } }, 'update', { status: 'done' })).toBe(false)
    expect(roles.has({ roles: ['desk'] }, 'money.read')).toBe(true)
  })
})

describe('catalog access', () => {
  const as = async (role: string) => {
    const access = await resolveAccess(catalog.products, { user: { id: 'u1', roles: [role] } }, { roles: catalog.roles })
    return { ...access, fields: Object.keys(restrictModel(catalog.products.toModel(), access).fields) }
  }

  it('shows anonymous visitors the store fields of published products, and lets them only read', async () => {
    const visitor = await as('anonymous')
    expect(visitor.fields).toEqual(['id', 'name', 'slug', 'price', 'image'])
    expect(visitor.rowFilter.read).toMatchObject({ field: { name: 'published' } })
    expect(visitor.operations).toMatchObject({ read: true, create: false, update: false, delete: false })
  })

  it('gives the warehouse system three columns and the stock to write', async () => {
    const sync = await as('erp_sync')
    expect(sync.fields).toEqual(['id', 'sku', 'price', 'stock'])
    expect(sync.writableFields).toEqual({ create: [], update: ['stock'] })
  })

  it('keeps the cost price for buyers, whatever else a role reads', async () => {
    expect((await as('editor')).fields).not.toContain('cost_price')
    expect((await as('buyer')).fields).toContain('cost_price')
  })
})

describe('keys', () => {
  it('points a two-column relation at a two-column key', () => {
    expect(keyTypes(models.part_orders!, (name) => models[name])).toEqual(['uuid'])
    expect(models.part_orders!.fields.part!.relation).toEqual({ resource: 'stock', columns: ['part_no', 'part_size'] })
    expect(models.part_orders!.fields.supplier_reference!.aliases).toEqual(['ref'])
  })
})

describe('the workshop', () => {
  it('shows the repairs as a board by default, beside cards and the table', () => {
    const list = workshop.repairsView.toModel(models.repairs).list!
    expect(list.displays!.map((display) => display.name)).toEqual(['cards', 'board', 'calendar'])
    expect(list.default).toBe('board')
    expect(list.displays![1]).toEqual({ kind: 'board', name: 'board', by: 'status', title: 'number', subtitle: 'bike', meta: ['mechanic'] })
    expect(list.displays![2]).toEqual({ kind: 'calendar', name: 'calendar', start: 'booked_on', title: 'number' })
  })

  it("puts the customer's earlier repairs on a repair's page", () => {
    expect(workshop.repairsView.toModel(models.repairs).layout[2]).toEqual({ kind: 'custom', component: 'CustomerRepairs', title: 'Earlier repairs of this customer', props: { limit: 5 } })
  })
})

describe('sorting by hand', () => {
  it('orders the products as one, and the items of each invoice on their own', () => {
    expect(invoiceItems.products.toModel().position).toEqual({ field: 'rank' })
    expect(invoiceItems.invoiceItems.toModel().position).toEqual({ field: 'position', within: 'invoice_id' })
  })

  it("orders a board's tasks by their rank", () => {
    expect(rankedBoard.tasks.toModel().position).toEqual({ field: 'rank' })
    expect(rankedBoard.tasksView.toModel(rankedBoard.tasks.toModel()).list?.displays?.[0]).toMatchObject({ kind: 'board', by: 'status' })
  })

  it("lists an invoice's items on its page by the relation they are ordered within, so they can be sorted there", () => {
    const items = invoiceItems.invoicesView.toModel(invoiceItems.invoices.toModel()).layout[1]
    expect(items).toMatchObject({ kind: 'related', resource: 'invoice_items', field: 'invoice_id' })
    expect(items).not.toHaveProperty('filter')
  })
})
