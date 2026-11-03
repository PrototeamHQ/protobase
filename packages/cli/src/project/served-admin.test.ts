import { describe, expect, it } from 'vitest'
import type { Db } from '@protobase/query'
import { servedAdmin } from './served-admin'

// A database that fails any query, so a read of the definitions fails the test.
const untouched = new Proxy({}, { get: () => { throw new Error('read the database') } }) as Db
const authenticate = () => ({ user: { id: 1, roles: [] } })

describe('servedAdmin', () => {
  it('reads no definition and serves the admin as built while userTables is off, whatever the database holds', async () => {
    for (const userTables of [undefined, false]) {
      const { admin } = await servedAdmin({ config: {}, jobs: [], authenticate, ...(userTables !== undefined && { userTables }) }, untouched)
      expect(admin).not.toHaveProperty('reload')
    }
  })
})
