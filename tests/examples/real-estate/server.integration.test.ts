import { SignJWT } from 'jose'
import { afterAll, describe, expect, it } from 'vitest'
import type { LayoutChild, LayoutNode } from '@protobase/layout'
import { configExports, createAdmin, jwtAuthenticator } from '@protobase/server'
import * as config from '../../../examples/real-estate/config'
import { portfolioOverview } from '../../../examples/real-estate/config'
import { roles } from '../../../examples/real-estate/config/roles'
import { createDb } from '../../../examples/real-estate/db/kysely'
import { databaseSeeded } from './seeded'

const seeded = await databaseSeeded()
const db = createDb(4)
afterAll(async () => { await db.destroy() })

// The API as `protobase serve` builds it from this config, in process; the built bundle served for real is covered by
// packages/cli/tests/serve/serve.integration.test.ts.
const secret = new TextEncoder().encode('real-estate-server-test-secret-12345678')
const token = await new SignJWT({ roles: ['admin'], tenant: 1 }).setProtectedHeader({ alg: 'HS256' }).setSubject('1').setExpirationTime('15m').sign(secret)
const app = createAdmin({ ...configExports(config), db, authenticate: jwtAuthenticator({ keys: async () => secret, algorithms: ['HS256'] }), options: { roles } })
const api = (path: string) => app.request(`/api${path}`, { headers: { authorization: `Bearer ${token}` } })

// Every block of a page that reads records: Stat, Table and RecordCard, with their filter and sort.
const dataBlocks = (node: LayoutNode): Array<{ type: string; resource: string; filter?: string; sort?: string }> => {
  const own = typeof node.props.resource === 'string'
    ? [{ type: node.type, resource: node.props.resource, filter: node.props.filter as string | undefined, sort: node.props.sort as string | undefined }]
    : []
  const children = node.children.filter((child: LayoutChild): child is LayoutNode => typeof child === 'object' && child !== null && 'type' in child)
  return [...own, ...children.flatMap(dataBlocks)]
}

// The config against the real schema and seed: what only a seeded database shows.
describe.skipIf(!seeded)('the real estate API against its seeded database', () => {
  it('lists every resource and opens its first record', async () => {
    const meta = await (await api('/meta')).json()
    expect(meta.resources).toHaveLength(19)
    for (const { name, primaryKey } of meta.resources as Array<{ name: string; primaryKey: string[] }>) {
      const list = await api(`/v1/${name}?page_size=5`)
      const body = await list.json()
      expect(list.status, `${name}: ${JSON.stringify(body)}`).toBe(200)
      expect(body.items.length, name).toBeGreaterThan(0)
      const key = primaryKey.map((field) => encodeURIComponent(body.items[0][field])).join(',')
      expect((await api(`/v1/${name}/${key}`)).status, `${name}/${key}`).toBe(200)
    }
  })

  it('answers every block of the overview, as the page asks for it', async () => {
    const blocks = dataBlocks(portfolioOverview.toModel().tree)
    expect(blocks).toHaveLength(9)
    for (const block of blocks) {
      const query = new URLSearchParams({ page_size: block.type === 'Table' ? '5' : '1', ...(block.type === 'Stat' && { count: 'exact' }) })
      if (block.filter) query.set('filter', block.filter)
      if (block.sort) query.set('order_by', block.sort)
      const response = await api(`/v1/${block.resource}?${query}`)
      expect(response.status, `${block.type} ${block.resource} ${block.filter ?? ''}: ${await response.clone().text()}`).toBe(200)
    }
  })
})
