import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { defineRoles } from '@protobase/schema'
import { createAdmin, defineFunction, type FunctionSource } from '@protobase/server'
import { allResources, as, createFixtureDb, testAuthenticator } from '../../../test-support/server'

let fixture: Awaited<ReturnType<typeof createFixtureDb>>
beforeAll(async () => {
  fixture = await createFixtureDb()
})
afterAll(async () => {
  await fixture.db.destroy()
})

const publishable = 'sb_publishable_1'
const roles = defineRoles({ admin: ['*'], viewer: ['*.read'] })
const serve = (functions: Record<string, FunctionSource>) =>
  createAdmin({ resources: allResources, db: fixture.db, authenticate: testAuthenticator, functions, files: { storage: false }, options: { roles, apiKeys: { publishable_key: publishable, secret_key: 'sb_secret_1' } } })

// The brief's `purge`, written for Protobase: it would delete through the raw database.
const purgeOf = () => vi.fn(async (_request: Request, { db }: { db: typeof fixture.db }) => {
  await db.deleteFrom('companies').execute()
  return new Response('done')
})

describe('functions at /api/sb/functions/v1, as createAdmin serves them in an app with roles and keys', () => {
  it('keep a function without supabase: true off the address, and serve a converted one to the publishable key', async () => {
    const purge = purgeOf()
    const app = serve({ purge: defineFunction(purge as never), bare: purge as never, hello: defineFunction({ supabase: true }, { fetch: () => new Response('hi') }) })
    for (const name of ['purge', 'bare']) {
      const response = await app.request(`/api/sb/functions/v1/${name}`, { method: 'POST', headers: { apikey: publishable } })
      expect([response.status, (await response.json()).detail]).toEqual([404, `The function "${name}" answers at /api/functions/${name} only: give it supabase: true to answer here too`])
    }
    expect(purge).not.toHaveBeenCalled()
    const hello = await app.request('/api/sb/functions/v1/hello', { method: 'POST', headers: { apikey: publishable } })
    expect([hello.status, await hello.text()]).toEqual([200, 'hi'])
  })

  it('change nothing at /api/functions for a function with supabase: true', async () => {
    const handler = vi.fn(() => new Response('ran'))
    const whoami = async (_request: Request, context: { caller: () => Promise<unknown> }) => Response.json(await context.caller())
    const app = serve({
      plain: defineFunction(handler),
      opted: defineFunction({ supabase: true }, handler),
      open: defineFunction({ public: true }, whoami as never),
      openOpted: defineFunction({ public: true, supabase: true }, whoami as never),
    })
    // The answer, with the function's name taken out of its problem's detail.
    const answer = async (name: string, headers: Record<string, string>) => {
      const response = await app.request(`/api/functions/${name}`, { method: 'POST', headers })
      return { status: response.status, detail: ((await response.json()).detail as string).replace(`"${name}"`, '<name>') }
    }
    // The publishable key alone is nobody there, and a viewer lacks the `*` that the app's roles ask of a protected function.
    const cases = [['plain', 'opted', { apikey: publishable }, 401], ['plain', 'opted', as(1, 'viewer'), 403], ['open', 'openOpted', { apikey: publishable }, 401]] as const
    for (const [plain, opted, headers, status] of cases) {
      const optedAnswer = await answer(opted, headers)
      expect(optedAnswer, opted).toEqual(await answer(plain, headers))
      expect(optedAnswer.status, opted).toBe(status)
    }
    expect(handler).not.toHaveBeenCalled()
  })

  it('refuse to start with a function that has supabase: true and roles or a capability', () => {
    const handler = () => new Response('never')
    expect(() => serve({ admin: defineFunction({ roles: ['admin'], supabase: true }, handler) })).toThrow('The function "admin" has supabase: true and roles')
    expect(() => serve({ vms: defineFunction({ capability: 'companies.update', supabase: true }, handler) })).toThrow('The function "vms" has supabase: true and a capability')
  })
})
