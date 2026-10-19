import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import type { Deps } from '../deps'
import { buildRegistry } from '../registry'
import type { Session } from '../types'
import type { Notice } from './notices-sql'
import { visibleNotices } from './visible-notices'

const sales = (ctx: { user?: { roles?: string[] } }) => Boolean(ctx.user?.roles?.includes('sales'))
const fields = { id: f.integer(), org_id: f.text() }
const orders = resource('orders').table('orders').fields(fields).primaryKey((r) => r.id).access({ list: sales, read: sales }).live()
const notes = resource('notes').table('notes').fields(fields).primaryKey((r) => r.id).tenant((r) => r.org_id).live()
const plain = resource('plain').table('plain').fields(fields).primaryKey((r) => r.id)

const deps = { registry: buildRegistry([orders, notes, plain]), accessOptions: {} } as unknown as Deps

const notice = (resource: string, tenant: string | null = null): Notice => ({ id: '1', resource, key: '1', operation: 'update', tenant })

const heard = async (session: Session) => {
  const visible = await visibleNotices(deps, session)
  return [notice('orders'), notice('notes', 'acme'), notice('notes', 'other'), notice('plain')].filter(visible).map((entry) => `${entry.resource}:${entry.tenant}`)
}

describe('visibleNotices', () => {
  it('passes the live resources the caller may read, in their tenant only', async () => {
    expect(await heard({ user: { id: 'u1', roles: ['sales'] }, tenant: 'acme' })).toEqual(['orders:null', 'notes:acme'])
    expect(await heard({ user: { id: 'u2', roles: ['user'] }, tenant: 'acme' })).toEqual(['notes:acme'])
  })

  it('passes nothing of a tenant resource to a caller without a tenant', async () => {
    expect(await heard({ user: { id: 'u1', roles: ['sales'] } })).toEqual(['orders:null'])
  })
})
