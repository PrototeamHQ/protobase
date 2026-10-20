import { mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { backgroundSettled } from '@protobase/server'
import { planFunctions } from './plan-functions'
import { writeFunctions } from './write-functions'

// The research's five Supabase functions (tests/supabase/fixtures/edge-functions), converted and called as Protobase
// serves them. Each answers as it did on Supabase's edge runtime (pb-supabase-research, §4).
const fixture = path.resolve(import.meta.dirname, '../../../tests/supabase/fixtures/edge-functions')
const url = 'http://app.test'
const anonKey = 'sb_publishable_test'
const aliceId = '11111111-1111-4111-8111-111111111111'

// Inside the package, so the converted code finds the packages it imports.
let projectDir: string
type Exported = { fetch: (request: Request) => Promise<Response> } | { kind: 'function'; handler: { fetch: (request: Request) => Promise<Response> } }
const call = async (name: string, request: Request) => {
  const exported = (await import(path.join(projectDir, 'functions', name, 'index.ts'))).default as Exported
  return ('kind' in exported ? exported.handler : exported).fetch(request)
}

// PostgREST behind `/rest/v1`, as RLS answers: alice's token reads her todo, the anonymous key nothing.
const postgrest = async (input: RequestInfo | URL, init?: RequestInit) => {
  const request = new Request(input, init)
  expect(request.url).toBe(`${url}/rest/v1/todos?select=title`)
  expect(request.headers.get('apikey')).toBe(anonKey)
  return Response.json(request.headers.get('authorization') === `Bearer ${aliceToken}` ? [{ title: 'alice todo' }] : [])
}

let aliceToken: string

beforeAll(async () => {
  projectDir = await mkdtemp(path.join(import.meta.dirname, '../../../tests/supabase/converted-'))
  await writeFunctions(projectDir, await planFunctions(fixture))
  // What `protobase dev` sets (`supabaseEnv`), with the key set inline instead of at `/auth/v1`.
  vi.stubEnv('SUPABASE_URL', url)
  vi.stubEnv('SUPABASE_ANON_KEY', anonKey)
  vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', anonKey)
  const { publicKey, privateKey } = await generateKeyPair('ES256')
  vi.stubEnv('SUPABASE_JWKS', JSON.stringify({ keys: [{ ...(await exportJWK(publicKey)), alg: 'ES256', kid: 'test', use: 'sig' }] }))
  aliceToken = await new SignJWT({ role: 'authenticated', email: 'alice@example.com' })
    .setProtectedHeader({ alg: 'ES256', kid: 'test' })
    .setSubject(aliceId)
    .setAudience('authenticated')
    .setIssuer(`${url}/auth/v1`)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey)
})

afterAll(async () => {
  vi.unstubAllEnvs()
  await rm(projectDir, { recursive: true, force: true })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("Supabase's sample functions, converted", () => {
  it("classic-rls reads the caller's todos through supabase-js", async () => {
    vi.stubGlobal('fetch', postgrest)
    const response = await call('classic-rls', new Request(`${url}/classic-rls`, { headers: { authorization: `Bearer ${aliceToken}` } }))
    expect(await response.json()).toEqual({ data: [{ title: 'alice todo' }], error: null })
  })

  it("new-rls reads the caller's todos through @supabase/server, and refuses a call without credentials", async () => {
    vi.stubGlobal('fetch', postgrest)
    const response = await call('new-rls', new Request(`${url}/new-rls`, { headers: { authorization: `Bearer ${aliceToken}` } }))
    expect(await response.json()).toEqual({ user: aliceId, data: [{ title: 'alice todo' }] })
    const anonymous = await call('new-rls', new Request(`${url}/new-rls`))
    expect(await anonymous.json()).toMatchObject({ code: 'MISSING_CREDENTIALS' })
  })

  it('stripe-webhooks is public and refuses an unsigned event', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.stubEnv('STRIPE_API_KEY', 'sk_test_123')
    vi.stubEnv('STRIPE_WEBHOOK_SIGNING_SECRET', 'whsec_123')
    const response = await call('stripe-webhooks', new Request(`${url}/stripe-webhooks`, { method: 'POST', body: '{}' }))
    expect(response.status).toBe(400)
    expect(await response.text()).toBe('No stripe-signature header value was provided.')
  })

  it('deno-env greets with the GREETING variable', async () => {
    vi.stubEnv('GREETING', 'Hoi')
    const response = await call('deno-env', new Request(`${url}/deno-env`, { method: 'POST', body: JSON.stringify({ name: 'Pip' }) }))
    expect(await response.json()).toEqual({ message: 'Hoi Pip' })
  })

  it('background answers at once and finishes its work before a graceful shutdown ends', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const response = await call('background', new Request(`${url}/background`))
    expect(await response.json()).toEqual({ queued: true })
    expect(log).not.toHaveBeenCalled()
    await backgroundSettled()
    expect(log).toHaveBeenCalledWith('background done', expect.any(Number))
  })
})
