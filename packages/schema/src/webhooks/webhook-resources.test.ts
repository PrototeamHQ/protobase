import { describe, expect, it } from 'vitest'
import { defineRoles } from '../access/roles'
import { resolveAccess } from '../access/resolve'
import { webhookResources } from './webhook-resources'

const { webhookSubscriptions, webhookDeliveries, webhookDeliveryLog } = webhookResources('webhooks', { deliveryLog: true })

const roles = defineRoles({
  admin: ['*'],
  viewer: ['*.read'],
  everything: ['*.*'],
  hooks: ['webhook_subscriptions.*', 'webhook_deliveries.read', 'webhook_deliveries.update'],
  names: ['*.read', { 'webhook_subscriptions.read': ['name', 'events'] }],
})

const as = (role: string) => resolveAccess(webhookSubscriptions, { user: { id: 'u1', roles: [role] } }, { roles })
const deliveriesAs = (role: string) => resolveAccess(webhookDeliveries, { user: { id: 'u1', roles: [role] } }, { roles })

describe('webhook resources and role wildcards', () => {
  it('give a *.read role nothing: no list, no read, so no URL and no secret to reveal', async () => {
    const access = await as('viewer')
    expect(access.operations).toEqual({ list: false, read: false, create: false, update: false, delete: false })
    expect(access.readableFields).toEqual([])
    expect((await deliveriesAs('viewer')).operations).toEqual({ list: false, read: false, create: false, update: false, delete: false })
    const log = await resolveAccess(webhookDeliveryLog!, { user: { id: 'u1', roles: ['viewer'] } }, { roles })
    expect(log.operations.read).toBe(false)
  })

  it('give nothing to *.* either', async () => {
    expect((await as('everything')).operations.read).toBe(false)
    expect((await deliveriesAs('everything')).operations.read).toBe(false)
  })

  it('give * full use: list, read the secret to reveal it, subscribe, send a test event and resend deliveries', async () => {
    const access = await as('admin')
    expect(access.operations).toEqual({ list: true, read: true, create: true, update: true, delete: true })
    expect(access.readableFields).toEqual(expect.arrayContaining(['url', 'secret']))
    expect(access.writableFields.update).toEqual(expect.arrayContaining(['send_test', 'rotate_secret']))
    const deliveries = await deliveriesAs('admin')
    expect(deliveries.operations).toMatchObject({ list: true, read: true, update: true })
    expect(deliveries.writableFields.update).toContain('resend')
  })

  it('still follow capabilities that name them', async () => {
    expect((await as('hooks')).operations).toEqual({ list: true, read: true, create: true, update: true, delete: true })
    expect((await deliveriesAs('hooks')).operations).toMatchObject({ read: true, update: true })
  })

  it('keep a named capability to its fields, whatever a wildcard of the same role would give', async () => {
    expect((await as('names')).readableFields).toEqual(['name', 'events'])
  })
})
