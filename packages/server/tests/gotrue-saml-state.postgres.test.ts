import { describe, expect, it } from 'vitest'
import { betterAuthAuthenticator } from '../src/better-auth/authenticator'
import { createAuth } from '../src/better-auth/create-auth'
import { createAdmin } from '../src/create-admin'
import { openPostgresDatabase, postgresTemplateReady } from '../../../test-support/postgres-database'
import { fakeSamlIdp } from './support/fake-saml-idp'

// A SAML assertion posted to the ACS with the state of a GoTrue sign-in (`/api/sb/auth/v1/authorize`): the ACS reads
// any Better Auth state, so only the SSO plugin's own check of the state, and `/authorize` starting social sign-ins
// alone, keep the assertion's session from reaching that flow's hand-off. Real Postgres, as the IdP's signed
// assertions carry fresh ids and times that a recording cannot replay.
const origin = 'http://localhost:5173'
const secret = 'test-secret-test-secret-test-secret-1234'
const app = 'authexp://callback'
const mallory = { email: 'mallory@acme.test' }
const idp = fakeSamlIdp()
const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'

const ready = await postgresTemplateReady('auth')

// Better Auth's rate limits are per client address and kept in memory, so every browser gets an address of its own.
let address = 0

const serve = async () => {
  const store = await openPostgresDatabase('auth')
  const auth = createAuth({
    database: { dialect: store.dialect, type: 'postgres' },
    baseURL: origin,
    secret,
    mailer: false,
    operator: false,
    signInProvider: false,
    roles: ['admin', 'user'],
    socialProviders: { github: { clientId: 'Iv1.client', clientSecret: 'client-secret' } },
    sso: { saml: [{ id: 'acme', name: 'Acme', domains: ['acme.test'], idp: { metadata: idp.metadata } }] },
    trustedOrigins: ['authexp://'],
  })
  const served = createAdmin({ resources: [], db: store.db, authenticate: betterAuthAuthenticator({ auth }), auth })

  // A browser: its own cookies and client address.
  const browser = () => {
    const cookies = new Map<string, string>()
    const from = `203.0.113.${++address}`
    const send = async (url: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}) => {
      const response = await served.request(url, { ...init, headers: { ...init.headers, cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join('; '), 'x-forwarded-for': from } })
      for (const line of response.headers.getSetCookie()) {
        const [name = '', value = ''] = line.split(';')[0]!.split('=')
        if (!value || /max-age=0/i.test(line)) cookies.delete(name)
        else cookies.set(name, value)
      }
      return response
    }
    // `/authorize`'s answer: to GitHub, with the state Better Auth keeps for the flow.
    const authorize = async () => {
      const toGitHub = await send(`${origin}/api/sb/auth/v1/authorize?${new URLSearchParams({ provider: 'github', redirect_to: app, code_challenge: challenge, code_challenge_method: 's256' })}`)
      expect(toGitHub.status).toBe(302)
      return new URL(toGitHub.headers.get('location')!).searchParams.get('state')!
    }
    // An SSO sign-in started here, and the IdP's signed answer to it.
    const approveAtIdp = async (callbackURL = `${origin}/`) => {
      const start = await send(`${origin}/api/auth/sign-in/sso`, { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify({ providerId: 'acme', callbackURL, errorCallbackURL: callbackURL }) })
      expect(start.status).toBe(200)
      const { url } = (await start.json()) as { url: string }
      const metadata = await (await send(`${origin}/api/auth/sso/saml2/sp/metadata?providerId=acme`)).text()
      return idp.approve(metadata, url, mallory)
    }
    const acs = (SAMLResponse: string, RelayState: string) =>
      send(`${origin}/api/auth/sso/saml2/sp/acs/acme`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: new URL(idp.ssoUrl).origin }, body: new URLSearchParams({ SAMLResponse, RelayState }).toString() })
    const follow = async (response: Response) => {
      expect(response.status).toBe(302)
      return new URL((await send(response.headers.get('location')!)).headers.get('location')!)
    }
    return { send, authorize, approveAtIdp, acs, follow, hasSession: () => [...cookies.keys()].some((name) => name.endsWith('session_token')) }
  }
  return { browser }
}

const setsSession = (response: Response) => response.headers.getSetCookie().some((line) => /session_token=[^;]/.test(line))

const expectNoHandOff = (back: URL) => {
  expect(back.searchParams.get('code')).toBeNull()
  expect(back.hash).not.toContain('access_token')
}

describe.skipIf(!ready)('a SAML assertion with the state of a GoTrue sign-in', () => {
  it('reaches neither the flow\'s hand-off nor a session, in another browser or the flow\'s own', async () => {
    const { browser } = await serve()
    const a = browser()
    const b = browser()

    const form = await b.approveAtIdp()
    const posted = await b.acs(form.SAMLResponse, await a.authorize())
    expect(posted.status).toBe(302)
    const toCallback = new URL(posted.headers.get('location')!)
    expect(`${toCallback.origin}${toCallback.pathname}`).toBe(`${origin}/api/sb/auth/v1/callback`)
    expect(toCallback.searchParams.get('flow')).toBeNull()
    expect(toCallback.searchParams.get('error')).toBe('invalid_state')
    expect(setsSession(posted)).toBe(false)
    expectNoHandOff(await b.follow(posted))

    // From the flow's own browser, as a form another site submits there would post it.
    const again = await b.approveAtIdp()
    const own = await a.acs(again.SAMLResponse, await a.authorize())
    expect(setsSession(own)).toBe(false)
    const back = await a.follow(own)
    expect(`${back.protocol}//${back.host}${back.pathname}`).toBe(app)
    expectNoHandOff(back)

    // The same assertion with its own state signs in: the state alone is what the ACS refused.
    const control = await b.approveAtIdp()
    const signedIn = await b.acs(control.SAMLResponse, control.RelayState)
    expect(signedIn.headers.get('location')).toBe(`${origin}/`)
    expect(setsSession(signedIn)).toBe(true)
  })

  it('hands no code to a pending flow for a SAML sign-in that ends at /callback, with or without a secret', async () => {
    const { browser } = await serve()
    const a = browser()
    const b = browser()
    for (const callbackURL of [`${origin}/api/sb/auth/v1/callback`, `${origin}/api/sb/auth/v1/callback?flow=made-up`]) {
      await a.authorize()
      const form = await b.approveAtIdp(callbackURL)
      // Mallory's own sign-in, posted from A's browser: it signs A in as mallory, and ends at A's flow.
      const posted = await a.acs(form.SAMLResponse, form.RelayState)
      expect(setsSession(posted)).toBe(true)
      const back = await a.follow(posted)
      expect(`${back.protocol}//${back.host}${back.pathname}`).toBe(app)
      expect(back.searchParams.get('error')).toBe('access_denied')
      expectNoHandOff(back)
    }
  })

  it('is not a provider GoTrue\'s /authorize starts', async () => {
    const { browser } = await serve()
    const refused = await browser().send(`${origin}/api/sb/auth/v1/authorize?provider=acme&code_challenge=${challenge}`)
    expect(refused.status).toBe(400)
    expect(await refused.json()).toMatchObject({ error_code: 'validation_failed' })
  })
})
