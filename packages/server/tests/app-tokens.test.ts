import { createLocalJWKSet } from 'jose'
import { PGliteDialect } from 'kysely-pglite-dialect'
import { beforeAll, describe, expect, it } from 'vitest'
import { betterAuthAuthenticator } from '../src/better-auth/authenticator'
import { createAuth, type AdminAuth } from '../src/better-auth/create-auth'
import { issueToken } from '../src/better-auth/tokens'
import { createUser } from '../src/better-auth/users'
import type { Authenticator } from '../src/types'
import { createAuthStore } from '../../../test-support/auth'

const shopUrl = 'https://shop.example.com'
const deskUrl = 'https://desk.example.com'
const password = 'correct horse battery'

const authAt = async (baseURL: string, roles: string[]) =>
  createAuth({ database: { dialect: new PGliteDialect(await createAuthStore()), type: 'postgres' }, baseURL, secret: `${baseURL}-secret-0123456789abcdef`, roles, mailer: false })

const bearer = (token: string) => new Request(`${deskUrl}/api/v1/tickets`, { headers: { authorization: `Bearer ${token}` } })

const statusOf = async (authenticate: Authenticator, token: string) => {
  try {
    await authenticate(bearer(token))
    return 200
  } catch (error) {
    return (error as { status: number }).status
  }
}

// The desk admits the shop's users beside its own: the shop's admins as `shop`, its clerks as nobody.
describe('an API that trusts another app', () => {
  let shop: AdminAuth
  let desk: AdminAuth
  let authenticate: Authenticator
  let shopAdmin: string

  beforeAll(async () => {
    ;[shop, desk] = await Promise.all([authAt(shopUrl, ['admin', 'clerk']), authAt(deskUrl, ['admin', 'shop'])])
    shopAdmin = (await createUser(shop, { email: 'owner@shop.example.com', password })).id
    await createUser(shop, { email: 'clerk@shop.example.com', password, role: 'clerk' })
    await createUser(desk, { email: 'agent@desk.example.com', password })
    authenticate = betterAuthAuthenticator({ auth: desk, tenant: 1, apps: [{ issuer: shopUrl, roles: { admin: 'shop' }, tenant: 7, keys: createLocalJWKSet(await shop.api.getJwks()) }] })
  })

  it("admits the other app's user with the roles it gives them here, in its tenant, under an id of that app", async () => {
    const { token } = await issueToken(shop, { email: 'owner@shop.example.com' })
    expect(await authenticate(bearer(token))).toEqual({ user: { id: `${shopAdmin}@shop.example.com`, roles: ['shop'] }, tenant: 7 })
  })

  it('refuses a user of the other app whose roles give them none here', async () => {
    const { token } = await issueToken(shop, { email: 'clerk@shop.example.com' })
    expect(await statusOf(authenticate, token)).toBe(403)
    const named = await shop.api.signJWT({ body: { payload: { sub: 'odd', role: 'constructor,toString', exp: Math.floor(Date.now() / 1000) + 60 } } })
    expect(await statusOf(authenticate, named.token)).toBe(403)
  })

  it("maps only the other app's global roles, never a role held in one of its organizations", async () => {
    const trusting = betterAuthAuthenticator({ auth: desk, apps: [{ issuer: shopUrl, roles: { manager: 'shop', user: 'shop' }, keys: createLocalJWKSet(await shop.api.getJwks()) }] })
    const member = await shop.api.signJWT({ body: { payload: { sub: 'member', role: 'user', app_roles: ['manager'], org: 'o1', exp: Math.floor(Date.now() / 1000) + 60 } } })
    expect(await statusOf(trusting, member.token)).toBe(403)
  })

  it("refuses a token that names the other app's issuer but is signed with other keys", async () => {
    const { token } = await desk.api.signJWT({ body: { payload: { iss: shopUrl, aud: shopUrl, sub: 'forged', role: 'admin', exp: Math.floor(Date.now() / 1000) + 60 } } })
    expect(await statusOf(authenticate, token)).toBe(401)
  })

  it("keeps admitting the app's own users, and refuses an issuer it does not trust", async () => {
    const own = await issueToken(desk, { email: 'agent@desk.example.com' })
    expect(await authenticate(bearer(own.token))).toMatchObject({ user: { roles: ['admin'] }, tenant: 1 })
    const stranger = await authAt('https://stranger.example.com', ['admin'])
    await createUser(stranger, { email: 'someone@stranger.example.com', password })
    expect(await statusOf(authenticate, (await issueToken(stranger, { email: 'someone@stranger.example.com' })).token)).toBe(401)
  })

  it('cannot trust itself', () => {
    expect(() => betterAuthAuthenticator({ auth: desk, apps: [{ issuer: `${deskUrl}/`, roles: { admin: 'admin' } }] })).toThrow('The trusted app https://desk.example.com is this app itself')
  })
})
