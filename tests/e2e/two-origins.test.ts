import { Kysely } from 'kysely'
import { PGliteDialect } from 'kysely-pglite-dialect'
import { chromium, type Browser, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { betterAuthAuthenticator, createAdmin, createAuth, createUser, type AdminAuth } from '@protobase/server'
import { createAuthStore } from '../../test-support/auth'
import { bundleBrowserClient } from './support/bundle-client'
import { startHttpsServer } from './support/https-server'
import { selfSignedCertificate } from './support/tls'

const email = 'root@example.com'
const password = 'correct horse battery'
const secret = 'e2e-secret-e2e-secret-e2e-secret-123456'

// One app on two hostnames over TLS, both resolved to a loopback port by Chromium; tokens are issued by the first,
// passkeys are made for the first host and used on the second through its /.well-known/webauthn.
describe('an app on two origins in a browser', () => {
  let server: Awaited<ReturnType<typeof startHttpsServer>>
  let first: string
  let second: string
  let auth: AdminAuth
  let browser: Browser
  let page: Page
  const sent: Array<{ to: string; text: string }> = []

  beforeAll(async () => {
    const [tls, script] = await Promise.all([selfSignedCertificate(['first.test', 'second.test']), bundleBrowserClient()])
    server = await startHttpsServer(tls)
    first = `https://first.test:${server.port}`
    second = `https://second.test:${server.port}`

    const store = await createAuthStore()
    auth = createAuth({ database: { dialect: new PGliteDialect(store), type: 'postgres' }, baseURL: first, origins: [second], secret, mailer: { send: async (message) => void sent.push(message) } })
    await createUser(auth, { email, password })
    const app = createAdmin({ resources: [], db: new Kysely<any>({ dialect: new PGliteDialect(store) }), authenticate: betterAuthAuthenticator({ auth }), auth })
    const html = '<!doctype html><title>Protobase</title><script type="module" src="/client.js"></script>'
    server.use((request) => {
      const { pathname } = new URL(request.url)
      if (pathname === '/client.js') return new Response(script, { headers: { 'content-type': 'text/javascript' } })
      if (pathname === '/') return new Response(html, { headers: { 'content-type': 'text/html' } })
      return app.fetch(request)
    })

    // Chromium fetches /.well-known/webauthn of the RP ID on port 443, which the rule maps to the server's port too.
    browser = await chromium.launch({ args: [`--host-resolver-rules=MAP *.test 127.0.0.1:${server.port}`, '--ignore-certificate-errors'] })
    const context = await browser.newContext({ ignoreHTTPSErrors: true })
    page = await context.newPage()
    const cdp = await context.newCDPSession(page)
    await cdp.send('WebAuthn.enable')
    await cdp.send('WebAuthn.addVirtualAuthenticator', {
      options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
    })
  })

  afterAll(async () => {
    await browser?.close()
    await server?.close()
  })

  const open = async (origin: string) => {
    await page.goto(`${origin}/`)
    await page.waitForFunction(() => window.auth !== undefined)
  }

  it('signs in with a password on the second origin, with a token issued by the first', async () => {
    await open(second)
    const { user, token } = await page.evaluate(async ([address, secretWord]) => {
      const result = await window.auth.signIn(address!, secretWord!)
      return { user: result.kind === 'signed-in' ? result.user.email : result.kind, token: await window.auth.token() }
    }, [email, password])
    expect(user).toBe(email)
    expect(JSON.parse(Buffer.from(token!.split('.')[1]!, 'base64url').toString())).toMatchObject({ iss: first, aud: first })
  })

  it('makes a passkey on the second origin for the first host, and signs in with it there', async () => {
    await open(second)
    await page.evaluate(() => window.auth.account.addPasskey('Laptop'))
    const { adapter } = await auth.$context
    expect(await adapter.findMany({ model: 'passkey' })).toEqual([expect.objectContaining({ name: 'Laptop', rpID: 'first.test' })])
    // The browser asked the first host which origins may use its passkeys.
    expect(server.requests).toContain('first.test/.well-known/webauthn')

    await page.evaluate(() => window.auth.signOut())
    await open(second)
    expect(await page.evaluate(async () => (await window.auth.signInWithPasskey()).email)).toBe(email)
    expect(await page.evaluate(async () => Boolean(await window.auth.token()))).toBe(true)
  })

  it('mails a password reset link on the origin that asked for it, which leads back there', async () => {
    await open(second)
    await page.evaluate(([address, back]) => window.auth.requestPasswordReset(address!, back!), [email, `${second}/?password-reset`])
    await vi.waitFor(() => expect(sent).toHaveLength(1), { timeout: 10_000 })
    const link = /https:\/\/\S+/.exec(sent[0]!.text)![0]
    expect(new URL(link).origin).toBe(second)

    await page.goto(link)
    const landed = new URL(page.url())
    expect(landed.origin).toBe(second)
    const token = landed.searchParams.get('token')
    expect(token).toBeTruthy()
    await page.waitForFunction(() => window.auth !== undefined)
    const signedIn = await page.evaluate(async ([resetToken, address]) => {
      await window.auth.resetPassword(resetToken!, 'another long password')
      return (await window.auth.signIn(address!, 'another long password')).kind
    }, [token, email])
    expect(signedIn).toBe('signed-in')
  })
})
