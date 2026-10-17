import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { checkOwnerFields } from './check-owners'
import { buildRegistry } from './registry'

const users = resource('users').table('users').fields({ id: f.integer() }).primaryKey((r) => r.id)
const orders = resource('orders').table('orders').fields({ id: f.integer(), owner_id: f.relation('users') }).primaryKey((r) => r.id).owner((r) => r.owner_id)
const notes = resource('notes').table('notes').fields({ id: f.integer(), user_id: f.text() }).primaryKey((r) => r.id).owner((r) => r.user_id)

describe('checkOwnerFields', () => {
  it("refuses an owner field that cannot hold Better Auth's user ids, naming it", () => {
    expect(() => checkOwnerFields(buildRegistry([users, orders]), { generatesUserIds: false })).toThrow(/^orders\.owner_id .* holds integer values and Better Auth's user ids are random text/)
  })

  it('takes a text owner, ids the app makes, and an app without Better Auth', () => {
    expect(() => checkOwnerFields(buildRegistry([notes]), { generatesUserIds: false })).not.toThrow()
    expect(() => checkOwnerFields(buildRegistry([users, orders]), { generatesUserIds: true })).not.toThrow()
    expect(() => checkOwnerFields(buildRegistry([users, orders]), undefined)).not.toThrow()
  })
})
