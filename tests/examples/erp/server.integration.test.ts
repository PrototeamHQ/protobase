import { afterAll, describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { SignJWT } from 'jose'
import { createAdmin, jwtAuthenticator } from '@protobase/server'
import { stockMoves } from '../../../examples/erp/config'
import { createDb } from '../../../examples/erp/db/kysely'
import { databaseReachable } from './reachable'

const reachable = await databaseReachable()
const db = createDb(4)
afterAll(async () => { await db.destroy() })

/** The same table as stockMoves with an unindexed text column exposed as filterable. */
const stockMoveReferences = resource('stockMoveReferences')
  .table('inventory.stock_moves')
  .fields({
    id: f.bigint().readOnly().filterable().sortable(),
    organizationId: f.relation('organizations').filterable().sortable(),
    reference: f.text().optional().filterable(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.organizationId)

const secret = new TextEncoder().encode('integration-test-secret-integration-test')

/** The API verifying real signed tokens; the returned `request` sends a token for `tenant`. */
const adminFor = async (tenant: number) => {
  const app = createAdmin({
    resources: [stockMoves, stockMoveReferences],
    db,
    authenticate: jwtAuthenticator({ keys: async () => secret, algorithms: ['HS256'] }),
  })
  const token = await new SignJWT({ tenant, roles: ['admin'] }).setProtectedHeader({ alg: 'HS256' }).setSubject('tester').setExpirationTime('10m').sign(secret)
  return { request: (path: string) => app.request(`/api/v1${path}`, { headers: { authorization: `Bearer ${token}` } }) }
}

const org1 = await adminFor(1)

// The scan guard on a real planner and a big table: paging, totals, aggregates and tenancy are @protobase/server's
// tests.
describe.skipIf(!reachable)('the scan guard against the seeded erp database', () => {
  const get = (app: typeof org1, path: string) => app.request(path)

  it('rejects a filter on an unindexed column with the index to create', async () => {
    const response = await get(org1, '/stockMoveReferences?filter=reference%20%3D%20%22PO-1%22')
    const problem = await response.json()
    expect(response.status).toBe(400)
    expect(problem.type).toBe('urn:protobase:problem:expensive-query')
    expect(problem.suggestion).toBe('create index on "inventory"."stock_moves" ("reference")')
  })

  it('lets an indexed filter through on the large table', async () => {
    const response = await get(org1, '/stockMoves?filter=movedAt%20%3E%3D%20%222026-09-01T00:00:00Z%22%20AND%20movedAt%20%3C%20%222026-09-02T00:00:00Z%22&page_size=5')
    expect(response.status).toBe(200)
  })
})
