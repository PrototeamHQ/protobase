import { describe, expect, it } from 'vitest'
import { checkRecord, keyTypes, resolveAccess, restrictModel, type ResourceModel } from '@protobase/schema'
import { customers, repairs } from './bike-shop/data'
import * as step5 from './bike-shop/step-5'
import { customerRows, repairRows } from './bike-shop/rows'
import { roles, workOrders } from './reference/access'
import { partOrders, stock } from './reference/keys'

// The documentation shows these files; this keeps what it says about them true.

const models: Record<string, ResourceModel> = Object.fromEntries([customers, repairs, stock, partOrders, workOrders].map((source) => [source.toModel().name, source.toModel()]))

describe('the bike shop', () => {
  it('describes its tables, leaving out the ignored column', () => {
    expect(models.repairs!.fields.notes!.column).toBe('internal_notes')
    expect(models.repairs!.fields).not.toHaveProperty('legacyRef')
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
    for (const row of repairRows) expect(repairs.recordSchema().safeParse({ ...row, legacyRef: undefined }).success).toBe(true)
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

describe('keys', () => {
  it('points a two-column relation at a two-column key', () => {
    expect(keyTypes(models.partOrders!, (name) => models[name])).toEqual(['uuid'])
    expect(models.partOrders!.fields.part!.relation).toEqual({ resource: 'stock', columns: ['part_no', 'part_size'] })
    expect(models.partOrders!.fields.supplierReference!.aliases).toEqual(['ref'])
  })
})
