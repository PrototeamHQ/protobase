import { randomBytes } from 'node:crypto'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { ConnectionsBusy, poolWaitMs } from '@protobase/server'
import { appPool } from '@protobase/server/internal'
import { connectOrBusy } from '../../packages/cli/src/project/pool-wait'
import { connectServer, databaseUrl, dropDatabase, poolerReachable, poolerUrl, serverReachable } from '../../scripts/test-db/templates'

vi.setConfig({ testTimeout: 30_000 })

// PgBouncer's admin console, which takes the simple query protocol only, as node-postgres sends a query without values.
const admin = async (command: string) => {
  const client = new pg.Client({ connectionString: databaseUrl('pgbouncer', poolerUrl) })
  await client.connect()
  await client.query(command)
  await client.end()
}

// A database that scaled to zero, as the platform pauses it on its pooler: a pool PgBouncer never logged in to the server
// for is cold, so it holds a client inside login, rather than at its first query, until the database is resumed. A login
// that arrives while paused also costs PgBouncer a server login attempt, so it tries again only `server_login_retry` (15 s
// by default) later, which the pool's wait for a new connection outlasts too.
describe.skipIf(!(await serverReachable()) || !(await poolerReachable()))("the app's pool through PgBouncer while its database wakes", () => {
  const database = `app_pool_wake_${randomBytes(4).toString('hex')}`
  const url = databaseUrl(database, poolerUrl)

  beforeAll(async () => {
    const server = connectServer()
    await server.unsafe(`create database "${database}"`)
    await server.end()
  })

  afterAll(async () => {
    await appPool(pg, url, 1).end()
    await dropDatabase(database)
  })

  it('waits for a cold pool past the time a query waits for a busy connection, until the database resumes', async () => {
    await admin(`PAUSE ${database}`)
    const pool = appPool(pg, url, 1)
    const started = Date.now()
    const resumed = new Promise((resolve) => setTimeout(resolve, 4_000)).then(() => admin(`RESUME ${database}`))
    const client = await connectOrBusy(pool)()
    const { rows } = await client.query('select 1 as one', [])
    client.release()
    await resumed
    expect(rows).toEqual([{ one: 1 }])
    expect(Date.now() - started).toBeGreaterThanOrEqual(4_000 - 10)
  })

  it('still fails with ConnectionsBusy once every connection stayed in use for poolWaitMs', async () => {
    const pool = appPool(pg, url, 1)
    const held = await connectOrBusy(pool)()
    const started = Date.now()
    await expect(connectOrBusy(pool)()).rejects.toBeInstanceOf(ConnectionsBusy)
    expect(Date.now() - started).toBeGreaterThanOrEqual(poolWaitMs - 10)
    held.release()
  })
})
