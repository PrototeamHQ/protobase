import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createAdmin, createUser, type AdminAuth } from '@protobase/server'
import { betterAuthAuthenticator, createAuth } from '@protobase/server/internal'
import { authBasePath } from '@protobase/schema/internal'
import { openPostgresDatabase, postgresTemplateReady, type PostgresDatabase } from '../../test-support/postgres-database'
import { startHttpsServer } from './support/https-server'
import { selfSignedCertificate } from './support/tls'

const visitor = { email: 'visitor@example.com', password: 'correct horse battery' }
const attacker = { email: 'attacker@example.com', password: 'another horse battery' }
const secret = 'e2e-secret-e2e-secret-e2e-secret-123456'

// The app on app.shared.test and another app on its sibling host evil.shared.test, which sets the attacker's session
// for the whole shared domain on a longer path, where the browser sends it first: by Set-Cookie and from page script,
// under the session cookie's name with each prefix. The app's own cookies are __Host- ones, which the browser takes only
// from the app's host, so it reads none of them.
describe.skipIf(!(await postgresTemplateReady('auth')))('session cookies planted from a sibling host', () => {
  let store: PostgresDatabase
  let server: Awaited<ReturnType<typeof startHttpsServer>>
  let app: string
  let evil: string
  let auth: AdminAuth
  let browser: Browser
  let context: BrowserContext
  let page: Page
  let planted: string[]

  beforeAll(async () => {
    server = await startHttpsServer(await selfSignedCertificate(['app.shared.test', 'evil.shared.test']))
    app = `https://app.shared.test:${server.port}`
    evil = `https://evil.shared.test:${server.port}`

    store = await openPostgresDatabase('auth')
    auth = createAuth({ database: { dialect: store.dialect, type: 'postgres' }, baseURL: app, secret, mailer: { send: async () => {} } })
    await createUser(auth, visitor)
    await createUser(auth, attacker)
    const admin = createAdmin({ resources: [], db: store.db, authenticate: betterAuthAuthenticator({ auth }), auth })

    // The attacker's own session on the app, as they would take it from their browser.
    const signedIn = await admin.fetch(
      new Request(`${app}${authBasePath}/sign-in/email`, { method: 'POST', headers: { 'content-type': 'application/json', origin: app }, body: JSON.stringify(attacker) }),
    )
    const session = signedIn.headers.getSetCookie().find((line) => line.startsWith('__Host-better-auth.session_token='))!
    const token = session.slice(session.indexOf('=') + 1, session.indexOf(';'))
    planted = ['__Secure-better-auth.session_token', '__Host-better-auth.session_token', 'better-auth.session_token'].map(
      (name) => `${name}=${token}; Domain=shared.test; Path=${authBasePath}; Secure; SameSite=Lax`,
    )

    const plantingPage = `<!doctype html><title>Sibling</title><script>for (const line of ${JSON.stringify(planted)}) document.cookie = line</script>`
    server.use((request) => {
      const { host, pathname } = new URL(request.url)
      if (host.startsWith('evil.')) {
        const headers = new Headers({ 'content-type': 'text/html' })
        for (const line of planted) headers.append('set-cookie', line)
        return new Response(pathname === '/' ? plantingPage : 'Not found', { headers })
      }
      if (pathname === '/') return new Response('<!doctype html><title>App</title>', { headers: { 'content-type': 'text/html' } })
      return admin.fetch(request)
    })

    browser = await chromium.launch({ args: [`--host-resolver-rules=MAP *.shared.test 127.0.0.1:${server.port}`, '--ignore-certificate-errors'] })
    context = await browser.newContext({ ignoreHTTPSErrors: true })
    page = await context.newPage()
  })

  afterAll(async () => {
    await browser?.close()
    await server?.close()
    await store?.close()
  })

  const plant = async () => {
    await page.goto(`${evil}/`)
    await page.waitForLoadState('load')
  }

  const sessionEmail = async () => {
    await page.goto(`${app}/`)
    return page.evaluate(async (path) => {
      const answer = await (await fetch(`${path}/get-session`)).json()
      return (answer?.user?.email as string | undefined) ?? null
    }, authBasePath)
  }

  it('lands the __Secure- and unprefixed cookies on the app, and no __Host- one', async () => {
    await plant()
    const names = (await context.cookies(`${app}${authBasePath}/get-session`)).map((cookie) => `${cookie.name}@${cookie.domain}`)
    expect(names).toEqual(expect.arrayContaining(['__Secure-better-auth.session_token@.shared.test', 'better-auth.session_token@.shared.test']))
    expect(names.some((name) => name.startsWith('__Host-'))).toBe(false)
  })

  it('does not sign a visitor in as the attacker', async () => {
    await plant()
    expect(await sessionEmail()).toBeNull()
  })

  it('keeps a signed-in visitor signed in as themselves', async () => {
    await page.goto(`${app}/`)
    const status = await page.evaluate(
      async ([path, body]) => (await fetch(`${path}/sign-in/email`, { method: 'POST', headers: { 'content-type': 'application/json' }, body })).status,
      [authBasePath, JSON.stringify(visitor)] as const,
    )
    expect(status).toBe(200)
    await plant()
    expect(await sessionEmail()).toBe(visitor.email)
  })
})
