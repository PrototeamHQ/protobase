import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { checkOwnerFields } from './check-owners'
import { buildRegistry } from './registry'

const users = resource('users').table('users').fields({ id: f.integer() }).primaryKey((r) => r.id)
const orders = resource('orders').table('orders').fields({ id: f.integer(), owner_id: f.relation('users') }).primaryKey((r) => r.id).owner((r) => r.owner_id)
const notes = resource('notes').table('notes').fields({ id: f.integer(), user_id: f.text() }).primaryKey((r) => r.id).owner((r) => r.user_id)
const tickets = resource('tickets').table('tickets').fields({ id: f.integer(), opened_by: f.uuid() }).primaryKey((r) => r.id).owner((r) => r.opened_by)
const visits = resource('visits').table('visits').fields({ id: f.integer(), user_id: f.bigint() }).primaryKey((r) => r.id).owner((r) => r.user_id)

describe('checkOwnerFields', () => {
  it("refuses an owner field that cannot hold Better Auth's user ids, naming it", () => {
    expect(() => checkOwnerFields(buildRegistry([users, orders]), undefined, { generatesUserIds: false })).toThrow(/^orders\.owner_id .* holds integer values and Better Auth's user ids are random text/)
  })

  it('takes a text owner, ids the app makes, and an app without Better Auth', () => {
    expect(() => checkOwnerFields(buildRegistry([notes]), undefined, { generatesUserIds: false })).not.toThrow()
    expect(() => checkOwnerFields(buildRegistry([users, orders]), undefined, { generatesUserIds: true })).not.toThrow()
    expect(() => checkOwnerFields(buildRegistry([users, orders]), undefined, undefined)).not.toThrow()
  })

  it("checks owner fields against the authenticator's declared user id type over Better Auth's", () => {
    expect(() => checkOwnerFields(buildRegistry([tickets, notes]), 'uuid', { generatesUserIds: false })).not.toThrow()
    expect(() => checkOwnerFields(buildRegistry([users, orders, visits]), 'integer', undefined)).not.toThrow()
    expect(() => checkOwnerFields(buildRegistry([tickets]), 'integer', undefined)).toThrow(/^tickets\.opened_by .* holds uuid values and the authenticator's users have integer ids/)
    expect(() => checkOwnerFields(buildRegistry([users, orders]), 'bigint', { generatesUserIds: true })).toThrow(/^orders\.owner_id .* holds integer values/)
  })
})
