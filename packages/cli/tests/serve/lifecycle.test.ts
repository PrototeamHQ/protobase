import { PGlite } from '@electric-sql/pglite'
import { Kysely } from 'kysely'
import { PGliteDialect } from 'kysely-pglite-dialect'
import { describe, expect, it, vi } from 'vitest'
import { unauthorized } from '@protobase/server'
import { startServe } from '../../src/serve/lifecycle'
import type { ServedProject } from '../../src/serve/load-bundle'

const pgliteDb = () => {
  const db = new Kysely<any>({ dialect: new PGliteDialect(new PGlite()) })
  return Object.assign(db, { destroy: vi.fn(() => Kysely.prototype.destroy.call(db)) })
}

const project: ServedProject = {
  config: {},
  authenticate: (request) => {
    if (request.headers.get('authorization') !== 'Bearer ok') throw unauthorized('Send a bearer token')
    return { user: { id: 1, roles: ['admin'] } }
  },
}

const env = { port: 0, databaseUrl: 'postgres://unused/app', requestLog: false }

describe('startServe', () => {
  it('serves /health without a token and the admin API behind the authenticator', async () => {
    const server = await startServe({ project, env, createDb: pgliteDb })
    const base = `http://localhost:${server.port}`
    const health = await fetch(`${base}/health`)
    expect(health.status).toBe(200)
    expect(await health.json()).toEqual({ status: 'ok' })
    expect((await fetch(`${base}/api/meta`)).status).toBe(401)
    expect((await fetch(`${base}/api/meta`, { headers: { authorization: 'Bearer ok' } })).status).toBe(200)
    await server.close()
  })

  it('creates a pool from DATABASE_URL and drains it after the server stops', async () => {
    const db = pgliteDb()
    const createDb = vi.fn(() => db)
    const server = await startServe({ project, env, createDb })
    expect(createDb).toHaveBeenCalledWith('postgres://unused/app')
    await server.close()
    expect(db.destroy).toHaveBeenCalledTimes(1)
    await expect(fetch(`http://localhost:${server.port}/health`)).rejects.toThrow()
  })

  it('uses the db the project exports and leaves closing it to the project', async () => {
    const db = pgliteDb()
    const createDb = vi.fn(pgliteDb)
    const server = await startServe({ project: { ...project, db }, env: { ...env, databaseUrl: undefined }, createDb })
    await server.close()
    expect(createDb).not.toHaveBeenCalled()
    expect(db.destroy).not.toHaveBeenCalled()
    await db.destroy()
  })

  it('needs DATABASE_URL when the project exports no db', async () => {
    await expect(startServe({ project, env: { ...env, databaseUrl: undefined } })).rejects.toThrow('No database: set DATABASE_URL')
  })

  it('drains its pool when the port is taken', async () => {
    const first = await startServe({ project, env, createDb: pgliteDb })
    const db = pgliteDb()
    await expect(startServe({ project, env: { ...env, port: first.port }, createDb: () => db })).rejects.toThrow('EADDRINUSE')
    expect(db.destroy).toHaveBeenCalledTimes(1)
    await first.close()
  })
})
