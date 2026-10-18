import { sql } from 'kysely'
import { describe, expect, it } from 'vitest'
import { betterAuthAuthenticator } from '../src/better-auth/authenticator'
import { createAuth, type CreateAuthOptions } from '../src/better-auth/create-auth'
import { createUser } from '../src/better-auth/users'
import { createAdmin } from '../src/create-admin'
import { openPostgresDatabase, postgresTemplateReady } from '../../../test-support/postgres-database'
import { fakeSamlIdp, type SamlPerson } from './support/fake-saml-idp'

const origin = 'http://localhost:5173'
const secret = 'test-secret-test-secret-test-secret-1234'
const password = 'correct horse battery'
const idp = fakeSamlIdp()

// Real Postgres, as the IdP's signed assertions carry fresh ids and times that a recording cannot replay.
const ready = await postgresTemplateReady('auth')

// Better Auth's rate limits are per client address and kept in memory, so every app gets an address of its own.
let address = 0

const cookiesOf = (response: Response) => response.headers.getSetCookie().map((line) => line.split(';')[0]!)

const sanne = (changes: Partial<SamlPerson> = {}): SamlPerson => ({ email: 'sanne@acme.test', attributes: { givenName: 'Sanne', surname: 'de Vries' }, ...changes })

// Every app gets a copy of the migrated store with an admin, the Acme provider, and a client address of its own.
const serve = async (options: Partial<CreateAuthOptions> = {}) => {
  const store = await openPostgresDatabase('auth')
  const auth = createAuth({
    database: { dialect: store.dialect, type: 'postgres' },
    baseURL: origin,
    secret,
    mailer: false,
    operator: false,
    signInProvider: false,
    roles: ['admin', 'user'],
    sso: { saml: [{ id: 'acme', name: 'Acme', domains: ['acme.test'], idp: { metadata: idp.metadata } }] },
    ...options,
  })
  await createUser(auth, { email: 'root@example.com', password })
  const app = createAdmin({ resources: [], db: store.db, authenticate: betterAuthAuthenticator({ auth }), auth })
  const from = `203.0.113.${++address}`
  const request = (path: string, init: { body?: unknown; cookie?: string } = {}) =>
    app.request(`${origin}/api/auth${path}`, {
      method: init.body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', origin, 'x-forwarded-for': from, ...(init.cookie && { cookie: init.cookie }) },
      ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
    })

  // The person's browser: start at the app, sign in at the IdP, and post its response to the ACS from the IdP's page.
  const samlSignIn = async (person: SamlPerson, tamper: (xml: string) => string = (xml) => xml, providerId = 'acme') => {
    const start = await request('/sign-in/sso', { body: { providerId, callbackURL: `${origin}/`, errorCallbackURL: `${origin}/` } })
    expect(start.status).toBe(200)
    const { url } = (await start.json()) as { url: string }
    const metadata = await (await request(`/sso/saml2/sp/metadata?providerId=${providerId}`)).text()
    const form = await idp.approve(metadata, url, person)
    const SAMLResponse = Buffer.from(tamper(Buffer.from(form.SAMLResponse, 'base64').toString('utf8'))).toString('base64')
    const acs = await app.request(`${origin}/api/auth/sso/saml2/sp/acs/${providerId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', origin: new URL(idp.ssoUrl).origin, 'x-forwarded-for': from },
      body: new URLSearchParams({ SAMLResponse, RelayState: form.RelayState }).toString(),
    })
    const cookie = cookiesOf(acs).join('; ')
    const session = cookie ? await (await request('/get-session', { cookie })).json() : null
    return { url, acs, session, location: acs.headers.get('location') }
  }

  const accounts = async () =>
    (await sql<{ email: string; providerId: string; accountId: string }>`select u.email, a.provider_id as "providerId", a.account_id as "accountId" from account a join "user" u on u.id = a.user_id where a.provider_id <> 'credential' order by u.email`.execute(store.db)).rows
  const user = async (email: string) => (await sql<{ id: string; name: string; role: string; emailVerified: boolean }>`select id, name, role, email_verified as "emailVerified" from "user" where email = ${email}`.execute(store.db)).rows[0]
  return { auth, store, request, samlSignIn, accounts, user }
}

describe.skipIf(!ready)('sign-in with a SAML identity provider', () => {
  it('is offered on the status with its id and name, and serves its metadata with the entity ID and the ACS of the origin', async () => {
    const { request } = await serve()
    expect(await (await request('/status')).json()).toMatchObject({ socialProviders: [], samlProviders: [{ id: 'acme', name: 'Acme' }] })
    const metadata = await request('/sso/saml2/sp/metadata?providerId=acme')
    expect(metadata.status).toBe(200)
    const xml = await metadata.text()
    expect(xml).toContain(`entityID="${origin}/api/auth/sso/saml2/sp/metadata?providerId=acme"`)
    expect(xml).toContain(`Location="${origin}/api/auth/sso/saml2/sp/acs/acme"`)
  })

  it('sends the person to the IdP, and signs up a new person at its domain with the default role and the asserted name', async () => {
    const { samlSignIn, accounts, user } = await serve()
    const { url, location, session } = await samlSignIn(sanne())
    expect(url.startsWith(`${idp.ssoUrl}?SAMLRequest=`)).toBe(true)
    expect(location).toBe(`${origin}/`)
    expect(session.user.email).toBe('sanne@acme.test')
    // The provider vouches for the addresses at its domains.
    expect(await user('sanne@acme.test')).toMatchObject({ name: 'Sanne de Vries', role: 'user', emailVerified: true })
    expect(await accounts()).toEqual([{ email: 'sanne@acme.test', providerId: 'acme', accountId: 'sanne@acme.test' }])
  })

  it('links an existing account with the address on the first sign-in', async () => {
    const { auth, samlSignIn, accounts } = await serve()
    const { id } = await createUser(auth, { email: 'sanne@acme.test', password, role: 'user' })
    const { session } = await samlSignIn(sanne())
    expect(session.user.id).toBe(id)
    expect(await accounts()).toEqual([{ email: 'sanne@acme.test', providerId: 'acme', accountId: 'sanne@acme.test' }])
  })

  it('keeps signing in a person it signed up when it changes their NameID', async () => {
    const { samlSignIn } = await serve()
    const first = await samlSignIn(sanne({ nameId: 'okta-user-1' }))
    const second = await samlSignIn(sanne({ nameId: 'sanne@acme.test' }))
    expect(second.location).toBe(`${origin}/`)
    expect(second.session.user.id).toBe(first.session.user.id)
  })

  it('lets people the old provider signed up sign in with a new provider for the same domain', async () => {
    const both = { saml: [{ id: 'acme', domains: ['acme.test'], idp: { metadata: idp.metadata } }, { id: 'acme-new', domains: ['acme.test'], idp: { metadata: idp.metadata } }] }
    const { samlSignIn } = await serve({ sso: both })
    const first = await samlSignIn(sanne())
    const second = await samlSignIn(sanne(), undefined, 'acme-new')
    expect(second.location).toBe(`${origin}/`)
    expect(second.session.user.id).toBe(first.session.user.id)
  })

  it('signs up nobody outside its domains, and links no account there', async () => {
    const { auth, samlSignIn, accounts, user } = await serve()
    const stranger = await samlSignIn(sanne({ email: 'mallory@other.test' }))
    expect(stranger.location).toMatch(new RegExp(`^${origin}/\\?error=EMAIL_DOMAIN_NOT_ALLOWED`))
    expect(stranger.session).toBeNull()
    expect(await user('mallory@other.test')).toBeUndefined()

    await createUser(auth, { email: 'root@other.test', password, role: 'user' })
    const takeover = await samlSignIn(sanne({ email: 'root@other.test' }))
    expect(takeover.location).toBe(`${origin}/?error=account_not_linked`)
    expect(takeover.session).toBeNull()
    expect(await accounts()).toEqual([])
  })

  it('refuses a response changed after the IdP signed it', async () => {
    const { samlSignIn, user } = await serve()
    const { location, session } = await samlSignIn(sanne(), (xml) => xml.replaceAll('sanne@acme.test', 'boss@acme.test'))
    expect(location).toMatch(/[?&]error=/)
    expect(session).toBeNull()
    expect(await user('boss@acme.test')).toBeUndefined()
  })

  it('answers 404 for a provider that is not configured, and for the endpoints of providers kept in a table', async () => {
    const { request, auth } = await serve()
    expect((await request('/sign-in/sso', { body: { providerId: 'other', callbackURL: `${origin}/` } })).status).toBe(404)
    expect((await request('/sign-in/sso', { body: { email: 'sanne@acme.test', callbackURL: `${origin}/` } })).status).toBe(404)
    expect((await request('/sso/saml2/sp/metadata?providerId=other')).status).toBe(404)
    expect((await request('/sso/saml2/sp/acs/other', { body: { SAMLResponse: 'x' } })).status).toBe(404)
    const cookie = cookiesOf(await request('/sign-in/email', { body: { email: 'root@example.com', password } })).join('; ')
    expect((await request('/sso/register', { cookie, body: { providerId: 'evil', issuer: 'https://evil.test', domain: 'acme.test' } })).status).toBe(404)
    expect((await request('/sso/providers', { cookie })).status).toBe(404)
    expect(auth.samlProviders).toEqual([{ id: 'acme', name: 'Acme' }])
  })
})
