import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'
import { describe, expect, it } from 'vitest'
import { betterAuthOptions, type CreateAuthOptions } from './create-auth'
import { roleDefinitions } from './organizations/role-definitions'

const options = (baseURL: string): CreateAuthOptions => ({
  database: undefined,
  baseURL,
  secret: 'test-secret-test-secret-test-secret-1234',
  socialProviders: { github: { clientId: 'Iv1.client', clientSecret: 'client-secret' } },
})
const resolved = { roles: ['admin', 'user'], definitions: roleDefinitions(), defaultRole: 'user' }

const authOn = (baseURL: string) => betterAuth({ ...betterAuthOptions(options(baseURL), resolved), database: memoryAdapter({ verification: [], sign_in_policy: [], session: [], user: [], passkey: [] }) })

// The Set-Cookie lines a sign-in with a provider (its `state`) and a passkey sign-in (its challenge) start with.
const signInCookies = async (baseURL: string) => {
  const auth = authOn(baseURL)
  const social = await auth.handler(
    new Request(`${baseURL}/api/auth/sign-in/social`, { method: 'POST', headers: { 'content-type': 'application/json', origin: baseURL }, body: JSON.stringify({ provider: 'github', callbackURL: '/' }) }),
  )
  const passkey = await auth.handler(new Request(`${baseURL}/api/auth/passkey/generate-authenticate-options`, { headers: { origin: baseURL } }))
  return [...social.headers.getSetCookie(), ...passkey.headers.getSetCookie()]
}

const nameOf = (line: string) => line.slice(0, line.indexOf('='))
const attributesOf = (line: string) => line.split(';').slice(1).map((attribute) => attribute.trim().toLowerCase())

describe('the auth cookies on https', () => {
  const baseURL = 'https://admin.example.com'

  it('are __Host- cookies: Secure, on Path=/ and without a Domain, so no sibling host can set them', async () => {
    const lines = await signInCookies(baseURL)
    expect(lines.map(nameOf)).toEqual(expect.arrayContaining(['__Host-better-auth.state', '__Host-better-auth.better-auth-passkey']))
    for (const line of lines) {
      expect(nameOf(line), line).toMatch(/^__Host-better-auth\./)
      expect(attributesOf(line), line).toEqual(expect.arrayContaining(['secure', 'path=/']))
      expect(attributesOf(line).some((attribute) => attribute.startsWith('domain=')), line).toBe(false)
    }
  })

  it("names the session's cookies and every other one Better Auth or a plugin makes the same way", async () => {
    const context = await authOn(baseURL).$context
    const cookies = [...Object.values(context.authCookies), ...['staff_state', 'two_factor', 'gotrue_flow'].map((name) => context.createAuthCookie(name))]
    for (const { name, attributes } of cookies) {
      expect(name).toMatch(/^__Host-better-auth\./)
      expect(attributes).toMatchObject({ secure: true, path: '/' })
      expect(attributes.domain).toBeUndefined()
    }
  })
})

describe('the auth cookies over http', () => {
  it("keep the port's names, without Secure", async () => {
    const lines = await signInCookies('http://localhost:5173')
    expect(lines.map(nameOf)).toEqual(expect.arrayContaining(['better-auth-5173.state', 'better-auth-5173.better-auth-passkey']))
    for (const line of lines) expect(attributesOf(line), line).not.toContain('secure')
    expect((await authOn('http://localhost:5173').$context).authCookies.sessionToken.name).toBe('better-auth-5173.session_token')
  })
})
