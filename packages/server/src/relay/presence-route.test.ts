import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { HttpProblem, problemResponse } from '../problem'
import { presenceRoutes } from './presence-route'
import type { PresenceReport } from './presence-report'

const key = 'p'.repeat(32)
const report = { started: 1795190000000, changes: [{ user: 'u1', status: 'offline', at: 1795200000000 }] }

const route = () => {
  const recorded: PresenceReport[] = []
  const app = new Hono()
  app.onError((error, c) => {
    if (error instanceof HttpProblem) return problemResponse(error, c.req.path)
    throw error
  })
  app.route('/presence', presenceRoutes({ key, record: async (taken) => void recorded.push(taken) }))
  const post = (body: unknown, authorization?: string) =>
    app.request('/presence', { method: 'POST', headers: { 'content-type': 'application/json', ...(authorization && { authorization }) }, body: JSON.stringify(body) })
  return { recorded, post }
}

describe('presenceRoutes', () => {
  it('records a report carrying the presence key, and answers 204', async () => {
    const { recorded, post } = route()
    expect((await post(report, `Bearer ${key}`)).status).toBe(204)
    expect(recorded).toEqual([report])
  })

  it('refuses a report without the key, or with another, and records nothing', async () => {
    const { recorded, post } = route()
    expect((await post(report)).status).toBe(401)
    expect((await post(report, `Bearer ${'q'.repeat(32)}`)).status).toBe(401)
    expect(recorded).toEqual([])
  })

  it('refuses a body that is no report', async () => {
    const { recorded, post } = route()
    expect((await post({ started: 1, changes: [{ user: 'u1', status: 'busy', at: 1 }] }, `Bearer ${key}`)).status).toBe(400)
    expect(recorded).toEqual([])
  })
})
