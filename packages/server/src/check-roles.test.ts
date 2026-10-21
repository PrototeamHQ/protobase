import { describe, expect, it } from 'vitest'
import { defineRoles, f, resource } from '@protobase/schema'
import { buildRegistry } from './registry'
import { checkRoleLimits } from './check-roles'

const products = resource('products').table('products').fields({ id: f.integer(), sku: f.text(), published: f.boolean() }).primaryKey((r) => r.id)
const stores = resource('stores').table('stores').fields({ id: f.integer(), organization_id: f.integer(), name: f.text() }).primaryKey((r) => r.id).tenant((r) => r.organization_id)
const registry = buildRegistry([products, stores])
const check = (definitions: Parameters<typeof defineRoles>[0]) => () => checkRoleLimits(registry, defineRoles(definitions).limits)

describe('checkRoleLimits', () => {
  it('accepts fields and filters that fit their resource', () => {
    expect(check({ shop: [{ 'products.read': { fields: ['sku'], filter: 'published = true' } }, 'stores.read'] })).not.toThrow()
  })

  it('refuses limits on names that are not resources, unknown fields and filters that do not fit', () => {
    expect(check({ x: [{ 'costs.read': ['amount'] }] })).toThrow('limits "costs.read" but "costs" is not a resource')
    expect(check({ x: [{ 'products.read': ['sku', 'prise'] }] })).toThrow('lists the field "prise" for "products.read" but products has no such field')
    expect(check({ x: [{ 'products.read': { filter: 'hidden = true' } }] })).toThrow('to a filter that does not fit products')
  })

  it('refuses a filter on an encrypted field, which only ever holds ciphertext', () => {
    const vaults = resource('vaults').table('vaults').fields({ id: f.integer(), iban: f.text().encrypted() }).primaryKey((r) => r.id)
    const limits = defineRoles({ x: [{ 'vaults.read': { filter: 'iban = x or id = 1' } }] }).limits
    expect(() => checkRoleLimits(buildRegistry([vaults]), limits)).toThrow('Field "iban" cannot be filtered on')
  })

  it('refuses an anonymous capability on a tenant-scoped resource', () => {
    expect(check({ anonymous: [{ 'stores.read': ['name'] }] })).toThrow('stores, which is tenant-scoped')
  })
})
