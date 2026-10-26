import { randomBytes } from 'node:crypto'
import { Kysely, sql } from 'kysely'
import { describe, expect, it, vi } from 'vitest'
import WebSocket from 'ws'
import { f, resource, view } from '@protobase/schema'
import { defineFunction, defineJob, isBackgroundWork, unauthorized } from '@protobase/server'
import type { Db } from '@protobase/query'
import { startServe, type ServeOptions } from '../../src/serve/lifecycle'
import { servedConfig } from '../support/served-config'
import { openSnapshotDb } from '../../../../test-support/sql-snapshot'

// An empty snapshot database, with a destroy the tests can count.
const emptyDb = async () => {
  const db = new Kysely<any>({ dialect: (await openSnapshotDb('empty')).dialect })
  return Object.assign(db, { destroy: vi.fn(() => Kysely.prototype.destroy.call(db)) })
}

// A createDb that hands out one empty db, created before the server starts.
const dbFactory = async () => {
  const db = await emptyDb()
  return () => db
}

type Project = Parameters<typeof servedConfig>[0] & { authenticate: NonNullable<Parameters<typeof servedConfig>[0]['authenticate']> }

const project: Project = {
  config: {},
  authenticate: (request) => {
    if (request.headers.get('authorization') !== 'Bearer ok') throw unauthorized('Send a bearer token')
    return { user: { id: 1, roles: ['admin'] } }
  },
}

// Serves the project's config as a bundle's, over the database `createDb` gives.
const serve = ({ project, createDb, ...options }: Omit<ServeOptions, 'config' | 'openDb'> & { project: Project; createDb?: (url: string) => Db }) =>
  startServe({ ...options, config: servedConfig(project), ...(createDb && { openDb: (url: string) => ({ db: createDb(url) }) }) })

// Taken before any test serves, since a replaced global stays replaced for the rest of the file.
const { Request, Response } = globalThis

// A fresh connection per request: a pooled keep-alive connection to an earlier server that held the same port, in this
// file or another the worker ran, gets closed unanswered instead of reaching the server under test.
const request = (url: string, init: RequestInit = {}) => fetch(url, { ...init, keepalive: false })

const env = { port: 0, databaseUrl: 'postgres://unused/app', requestLog: false, filesCleanupMinutes: 0, runJobs: true, startupChecks: true, trustedProxies: [] }

describe('startServe', () => {
  it('serves /health without a token and the admin API behind the authenticator', async () => {
    const server = await serve({ project, env, createDb: await dbFactory() })
    const base = `http://localhost:${server.port}`
    const health = await request(`${base}/health`)
    expect(health.status).toBe(200)
    expect(await health.json()).toEqual({ status: 'ok' })
    expect((await request(`${base}/api/meta`)).status).toBe(401)
    expect((await request(`${base}/api/meta`, { headers: { authorization: 'Bearer ok' } })).status).toBe(200)
    await server.close()
  })

  it("passes the client's address in X-Forwarded-For: the socket's peer, or what a trusted proxy forwards", async () => {
    const seen: (string | null)[] = []
    const echo: Project = { config: {}, authenticate: (request) => (seen.push(request.headers.get('x-forwarded-for')), project.authenticate(request)) }
    const meta = (port: number) => request(`http://127.0.0.1:${port}/api/meta`, { headers: { 'x-forwarded-for': '6.6.6.6, 203.0.113.7' } })
    const direct = await serve({ project: echo, env, createDb: await dbFactory() })
    await meta(direct.port)
    await direct.close()
    const proxied = await serve({ project: echo, env: { ...env, trustedProxies: ['127.0.0.1'] }, createDb: await dbFactory() })
    await meta(proxied.port)
    await proxied.close()
    expect(seen).toEqual(['127.0.0.1', '203.0.113.7'])
  })

  // Bun's S3 and file writes take the native Response; given another class they store its text, `[object Response]`.
  it("keeps the runtime's own Request and Response after serving a request", async () => {
    const server = await serve({ project, env, createDb: await dbFactory() })
    expect((await request(`http://localhost:${server.port}/health`)).status).toBe(200)
    await server.close()
    expect(globalThis.Response).toBe(Response)
    expect(globalThis.Request).toBe(Request)
  })

  it('creates a pool from DATABASE_URL and drains it after the server stops', async () => {
    const db = await emptyDb()
    const createDb = vi.fn(() => db)
    const server = await serve({ project, env, createDb })
    expect(createDb).toHaveBeenCalledWith('postgres://unused/app')
    await server.close()
    expect(db.destroy).toHaveBeenCalledTimes(1)
    await expect(request(`http://localhost:${server.port}/health`)).rejects.toThrow()
  })

  it('needs DATABASE_URL', async () => {
    await expect(serve({ project, env: { ...env, databaseUrl: undefined } })).rejects.toThrow('No database: set DATABASE_URL')
  })

  it('drains its pool when the port is taken', async () => {
    const first = await serve({ project, env, createDb: await dbFactory() })
    const db = await emptyDb()
    await expect(serve({ project, env: { ...env, port: first.port }, createDb: () => db })).rejects.toMatchObject({ code: 'EADDRINUSE' })
    expect(db.destroy).toHaveBeenCalledTimes(1)
    await first.close()
  })

  it('refuses to start while the jobs schema is missing, and drains its pool', async () => {
    const db = new Kysely<any>({ dialect: (await openSnapshotDb('empty')).dialect })
    const destroy = vi.spyOn(db, 'destroy')
    const job = defineJob({ name: 'nightly', run: () => {} })
    await expect(serve({ project: { ...project, jobs: { job } }, env, createDb: () => db })).rejects.toThrow('The jobs schema is missing')
    expect(destroy).toHaveBeenCalledTimes(1)
  }, 30_000)

  it('refuses to start with an AI action and no model to run it, unless startup checks are off', async () => {
    vi.stubEnv('PROTOBASE_ASSISTANT_API_KEY', '')
    const tickets = resource('tickets').table('tickets').fields({ id: f.integer(), title: f.text(), priority: f.text().optional() }).primaryKey((r) => r.id)
    const ticketsView = view<typeof tickets>('tickets').actions((a) => [a.ai('triage', { label: 'Triage', prompt: '{title}', writes: 'priority' })])
    const withAi = { ...project, config: { tickets, ticketsView } }
    await expect(serve({ project: withAi, env, createDb: await dbFactory() })).rejects.toThrow('AI fields and actions need a model: set PROTOBASE_ASSISTANT_API_KEY')
    const server = await serve({ project: withAi, env: { ...env, startupChecks: false }, createDb: await dbFactory() })
    await server.close()
    vi.unstubAllEnvs()
  })

  it('enqueues but runs no job with PROTOBASE_JOBS=false', async () => {
    const db = new Kysely<any>({ dialect: (await openSnapshotDb('jobs')).dialect })
    const run = vi.fn()
    const job = defineJob({ name: 'elsewhere', run })
    const server = await serve({ project: { ...project, jobs: { job } }, env: { ...env, runJobs: false }, createDb: () => db })
    try {
      await job.enqueue(db)
      await new Promise((resolve) => setTimeout(resolve, 500))
      expect(run).not.toHaveBeenCalled()
    } finally {
      await server.close()
    }
  }, 30_000)

  it('drains due jobs for the operator, with POST /api/jobs/drain and the drain token', async () => {
    const db = new Kysely<any>({ dialect: (await openSnapshotDb('jobs')).dialect })
    const run = vi.fn()
    const job = defineJob({ name: 'drained', run })
    const server = await serve({ project: { ...project, jobs: { job } }, env: { ...env, drainToken: 'operator-token' }, createDb: () => db })
    const drain = (token?: string, query = '') =>
      request(`http://localhost:${server.port}/api/jobs/drain${query}`, { method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {} })
    try {
      await sql`select jobs.enqueue('drained')`.execute(db)
      expect((await drain()).status).toBe(401)
      expect((await drain('a user token')).status).toBe(401)
      expect((await drain('operator-token', '?seconds=0')).status).toBe(400)
      const drained = await drain('operator-token', '?seconds=20')
      expect(drained.status).toBe(200)
      expect(await drained.json()).toEqual({ drained: true, remaining: 0, nextDue: null })
      expect(run).toHaveBeenCalledTimes(1)
    } finally {
      await server.close()
    }
  }, 30_000)

  it('has no drain endpoint without a drain token, and refuses to drain with PROTOBASE_JOBS=false', async () => {
    const snapshot = await openSnapshotDb('jobs')
    // Each server drains its pool when it stops, so each gets a Kysely of its own on the one snapshot.
    const db = () => new Kysely<any>({ dialect: snapshot.dialect })
    const job = defineJob({ name: 'elsewhere', run: () => {} })
    const without = await serve({ project: { ...project, jobs: { job } }, env, createDb: db })
    try {
      expect((await request(`http://localhost:${without.port}/api/jobs/drain`, { method: 'POST', headers: { authorization: 'Bearer ok' } })).status).toBe(404)
    } finally {
      await without.close()
    }
    const off = await serve({ project: { ...project, jobs: { job } }, env: { ...env, runJobs: false, drainToken: 't' }, createDb: db })
    try {
      const refused = await request(`http://localhost:${off.port}/api/jobs/drain`, { method: 'POST', headers: { authorization: 'Bearer t' } })
      expect(refused.status).toBe(409)
      expect((await refused.json()).detail).toBe('This process runs no jobs (PROTOBASE_JOBS=false); drain the one that does')
    } finally {
      await off.close()
    }
  }, 30_000)

  it('opens a function’s WebSocket for its caller only, echoes text and binary as they are, and closes it with 1001 on stop', async () => {
    const inBackground: boolean[] = []
    const echo = defineFunction((_request, { acceptWebSocket }) =>
      acceptWebSocket({
        onOpen: () => void inBackground.push(isBackgroundWork()),
        onMessage: (data, socket) => socket.send(data),
      }),
    )
    const server = await serve({ project: { ...project, functions: { echo } }, env, createDb: await dbFactory() })
    const url = `ws://localhost:${server.port}/api/functions/echo`

    const refused = new WebSocket(url)
    const status = await new Promise((resolve) => refused.once('unexpected-response', (_request, response) => resolve(response.statusCode)))
    expect(status).toBe(401)

    const socket = new WebSocket(url, { headers: { authorization: 'Bearer ok' } })
    const messages: Array<{ data: Buffer; isBinary: boolean }> = []
    socket.on('message', (data: Buffer, isBinary) => messages.push({ data, isBinary }))
    await new Promise((resolve, reject) => socket.once('open', resolve).once('error', reject))
    const bytes = randomBytes(1 << 20)
    socket.send('hello')
    socket.send(bytes)
    await vi.waitFor(() => expect(messages).toHaveLength(2))
    expect(messages[0]!.isBinary).toBe(false)
    expect(messages[0]!.data.toString()).toBe('hello')
    expect(messages[1]!.isBinary).toBe(true)
    expect(messages[1]!.data.equals(bytes)).toBe(true)

    const closed = new Promise((resolve) => socket.once('close', (code) => resolve(code)))
    await server.close()
    expect(await closed).toBe(1001)
    // The socket's handlers run as the function's background work.
    expect(inBackground).toEqual([true])
  }, 30_000)

  it('closes a function socket with 1009 for a message over its maxMessageBytes, and refuses a cap that is no whole number', async () => {
    const received: number[] = []
    const closes: number[] = []
    const recheck = vi.fn()
    const small = defineFunction((_request, { acceptWebSocket }) =>
      acceptWebSocket({
        maxMessageBytes: 1024,
        onMessage: (data) => void received.push(typeof data === 'string' ? data.length : data.byteLength),
        onClose: (code) => void closes.push(code),
        recheck,
      }),
    )
    const echo = defineFunction((_request, { acceptWebSocket }) => acceptWebSocket({ onMessage: (data, socket) => socket.send(data) }))
    const opened = vi.fn()
    const invalid = Object.fromEntries(
      [null, '1024', 1024n, new Number(1024)].map((maxMessageBytes, n) => [`invalid${n}`, defineFunction((_request, { acceptWebSocket }) => acceptWebSocket({ maxMessageBytes: maxMessageBytes as number, onOpen: opened }))]),
    )
    const server = await serve({ project: { ...project, functions: { small, echo, ...invalid } }, env, createDb: await dbFactory() })
    const open = async (name: string) => {
      const socket = new WebSocket(`ws://localhost:${server.port}/api/functions/${name}`, { headers: { authorization: 'Bearer ok' } })
      await new Promise((resolve, reject) => socket.once('open', resolve).once('error', reject))
      return socket
    }
    try {
      const capped = await open('small')
      capped.send(new Uint8Array(1024))
      await vi.waitFor(() => expect(received).toEqual([1024]))
      const closed = new Promise((resolve) => capped.once('close', resolve))
      capped.send(new Uint8Array(1025))
      expect(await closed).toBe(1009)
      // The server ends the socket itself, so its own side closes without the client's close frame.
      await vi.waitFor(() => expect(closes).toHaveLength(1))
      expect(received).toEqual([1024])
      expect(recheck).not.toHaveBeenCalled()

      const uncapped = await open('echo')
      const echoed = new Promise<Buffer>((resolve) => uncapped.once('message', resolve))
      uncapped.send(new Uint8Array(1 << 20))
      expect((await echoed).byteLength).toBe(1 << 20)
      uncapped.close()

      for (const name of Object.keys(invalid)) {
        const refused = new WebSocket(`ws://localhost:${server.port}/api/functions/${name}`, { headers: { authorization: 'Bearer ok' } })
        refused.on('error', () => {})
        const status = await new Promise((resolve) => refused.once('unexpected-response', (_request, response) => resolve(response.statusCode)).once('open', () => resolve(101)))
        expect(status).toBe(500)
        refused.terminate()
      }
      expect(opened).not.toHaveBeenCalled()
    } finally {
      await server.close()
    }
  }, 30_000)
})
