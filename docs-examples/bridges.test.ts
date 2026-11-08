import { describe, expect, it } from 'vitest'
import type { FunctionContext } from '@protobase/server'
import { workshopConsole } from './bridges/workshop-console'

// The documentation shows this bridge; this keeps what it says about who reaches which machine true.

const askToken = async (roles: string[], target: string) => {
  const request = new Request('http://shop.test/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ target }) })
  const context = { session: { user: { id: 'u1', roles } } } as unknown as FunctionContext
  return Promise.resolve(workshopConsole(request, context)).then(
    async (response) => ({ status: response.status, body: (await response.json()) as { expires_at: string } }),
    (problem: { status: number }) => ({ status: problem.status, body: undefined }),
  )
}

describe('the workshop console', () => {
  it('lets a mechanic reach the truing stand for an hour, but not the stock database', async () => {
    const stand = await askToken(['mechanic'], 'truing-stand')
    expect(stand.status).toBe(201)
    expect(Date.parse(stand.body!.expires_at) - Date.now()).toBeGreaterThan(3500_000)
    expect((await askToken(['mechanic'], 'stock-db')).status).toBe(404)
    expect((await askToken(['mechanic'], 'till')).status).toBe(404)
  })

  it('lets an admin reach the stock database for ten minutes', async () => {
    const db = await askToken(['admin'], 'stock-db')
    expect(db.status).toBe(201)
    expect(Date.parse(db.body!.expires_at) - Date.now()).toBeLessThanOrEqual(600_000)
  })
})
