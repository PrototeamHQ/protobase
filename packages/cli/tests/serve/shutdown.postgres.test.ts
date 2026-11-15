import { Agent, request } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import { defineFunction, type FunctionSource } from '@protobase/server'
import { startServe } from '../../src/serve/lifecycle'
import { servedConfig } from '../support/served-config'
import { openPostgresDatabase, postgresTemplateReady } from '../../../../test-support/postgres-database'

const env = { port: 0, requestLog: false, filesCleanupMinutes: 0, runJobs: false, startupChecks: false, trustedProxies: [] }

type Answer = { status: number; connection: string | undefined }

// A client on one keep-alive connection of its own, as a runner is: each GET answers its status and Connection header.
const keepAliveClient = (port: number, path: string) => {
  const agent = new Agent({ keepAlive: true, maxSockets: 1 })
  const get = () =>
    new Promise<Answer>((resolve, reject) => {
      request({ host: '127.0.0.1', port, path, agent }, (response) => {
        response.resume()
        response.once('end', () => resolve({ status: response.statusCode!, connection: response.headers.connection }))
      })
        .once('error', reject)
        .end()
    })
  const sockets = () => [...Object.values(agent.sockets), ...Object.values(agent.freeSockets)].flat().length
  return { get, sockets, destroy: () => agent.destroy() }
}

// The project served with these functions on a clone of its own, which the test drops when it finishes.
const serve = async (functions: Record<string, FunctionSource>, closeGraceMs: number) => {
  const database = await openPostgresDatabase('empty')
  const config = servedConfig({ functions, authenticate: () => ({ user: { id: 1, roles: ['admin'] } }) })
  return startServe({ config, env: { ...env, databaseUrl: database.url }, closeGraceMs })
}

describe.skipIf(!(await postgresTemplateReady('empty')))('how protobase serve closes', () => {
  it('closes while a keep-alive client asks again as each answer comes, as a runner polls, ending its connection after the answer open', async () => {
    let asked = 0
    const held = defineFunction(async () => {
      asked += 1
      await new Promise((resolve) => setTimeout(resolve, 200))
      return new Response('held')
    })
    const server = await serve({ held }, 20_000)
    const client = keepAliveClient(server.port, '/api/functions/held')
    const answers: Answer[] = []
    const polling = (async () => {
      for (;;) answers.push(await client.get())
    })()
    polling.catch(() => {})
    try {
      await vi.waitFor(() => expect(answers.length).toBeGreaterThanOrEqual(2), { timeout: 5000 })
      // Closing as the function holds a request, not between two.
      await vi.waitFor(() => expect(asked).toBe(answers.length + 1), { interval: 5 })
      // Every answer so far came on the one connection, kept alive.
      expect(client.sockets()).toBe(1)
      expect(answers.every((answer) => answer.status === 200 && answer.connection === 'keep-alive')).toBe(true)
      const started = Date.now()
      await server.close()
      // Long before the grace ran out: the answer open as it closed ended its connection.
      expect(Date.now() - started).toBeLessThan(5000)
      // The next request finds no server, rather than an answer.
      await expect(polling).rejects.toThrow()
      expect(answers.at(-1)).toEqual({ status: 200, connection: 'close' })
    } finally {
      client.destroy()
    }
  }, 30_000)

  it('drops the connection of a request still open once the grace of close ran out', async () => {
    let held = false
    const hanging = defineFunction(
      (request) =>
        new Promise<Response>((resolve) => {
          held = true
          request.signal.addEventListener('abort', () => resolve(new Response('gone')))
        }),
    )
    const server = await serve({ hanging }, 300)
    const client = keepAliveClient(server.port, '/api/functions/hanging')
    const asked = client.get()
    asked.catch(() => {})
    try {
      await vi.waitFor(() => expect(held).toBe(true))
      const started = Date.now()
      await server.close()
      expect(Date.now() - started).toBeGreaterThanOrEqual(250)
      await expect(asked).rejects.toThrow()
    } finally {
      client.destroy()
    }
  }, 30_000)
})
