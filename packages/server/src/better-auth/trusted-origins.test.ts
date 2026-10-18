import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'
import { describe, expect, it } from 'vitest'
import { betterAuthOptions, type CreateAuthOptions } from './create-auth'
import { roleDefinitions } from './organizations/role-definitions'

const base: CreateAuthOptions = {
  database: undefined,
  baseURL: 'https://admin.example.com',
  secret: 'test-secret-test-secret-test-secret-1234',
  socialProviders: { github: { clientId: 'Iv1.client', clientSecret: 'client-secret' } },
}
const resolved = { roles: ['admin', 'user'], definitions: roleDefinitions(), defaultRole: 'user' }

// Asks Better Auth, set up with Protobase's options, for a GitHub sign-in that returns to `callbackURL`. Better Auth
// skips its origin check under a test runner, so it is turned back on here.
const signIn = async (callbackURL: string, options: CreateAuthOptions = base) => {
  const authOptions = betterAuthOptions(options, resolved)
  const database = memoryAdapter({ verification: [], sign_in_policy: [] })
  const auth = betterAuth({ ...authOptions, database, advanced: { ...authOptions.advanced, disableOriginCheck: false } })
  const response = await auth.handler(
    new Request('https://admin.example.com/api/auth/sign-in/social', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://admin.example.com' },
      body: JSON.stringify({ provider: 'github', callbackURL }),
    }),
  )
  return response.status
}

describe('trusted origins', () => {
  it('follows a sign-in callback to the app itself', async () => {
    expect(await signIn('https://admin.example.com/')).toBe(200)
  })

  it('does not follow a sign-in callback to someone else on trycloudflare.com', async () => {
    expect(await signIn('https://evil.trycloudflare.com/')).toBe(403)
  })

  it('follows a sign-in callback to a tunnel host the config names', async () => {
    expect(await signIn('https://my-tunnel.trycloudflare.com/', { ...base, trustedOrigins: ['https://my-tunnel.trycloudflare.com'] })).toBe(200)
  })
})
