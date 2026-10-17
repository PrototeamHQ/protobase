import { describe, expect, it } from 'vitest'
import { defineRoles, f, resolveAccess, resource } from '@protobase/schema'
import { checkOwnerId } from './owner-id'
import { buildRegistry } from './registry'

const roles = defineRoles<'orders'>({ manager: ['orders.read'], sales: ['orders.read.own'] })
const users = resource('users').table('users').fields({ id: f.integer() }).primaryKey((r) => r.id)
const orders = resource('orders')
  .table('orders')
  .fields({ id: f.integer(), owner_id: f.relation('users') })
  .primaryKey((r) => r.id)
  .owner((r) => r.owner_id)
  .access({ read: roles.can('orders.read') })
const entry = buildRegistry([users, orders]).find('orders')!

const check = async (id: string, role: string) => {
  const user = { id, roles: [role] }
  checkOwnerId(entry, user, await resolveAccess(orders, { user }))
}

describe('checkOwnerId', () => {
  it('names the owner field when its own records are asked by an id it cannot hold', async () => {
    await expect(check('vTFYcxtQCChwUPftV1l2xGmLi96JzLO3', 'sales')).rejects.toMatchObject({
      status: 500,
      slug: 'owner-id-mismatch',
      message: expect.stringMatching(/^orders\.owner_id holds integer user ids, and the signed-in user's id "vTFYcxtQCChwUPftV1l2xGmLi96JzLO3" is not one/),
    })
  })

  it('lets an id that fits, and a caller whose rows are not narrowed to their own', async () => {
    await expect(check('42', 'sales')).resolves.toBeUndefined()
    await expect(check('vTFYcxtQCChwUPftV1l2xGmLi96JzLO3', 'manager')).resolves.toBeUndefined()
  })
})
