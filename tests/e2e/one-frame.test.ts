import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { chromium, type Browser, type BrowserContext } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Card, Page, Stat, Table, page } from '@protobase/layout'
import { jsx } from '@protobase/layout/jsx-runtime'
import { f, resource, view } from '@protobase/schema'
import { createAdmin, createUser } from '@protobase/server'
import { betterAuthAuthenticator, createAuth } from '@protobase/server/internal'
import { buildShell, shellPaths } from '../../packages/cli/src/build/shell'
import { openPostgresDatabase, postgresTemplateReady, type PostgresDatabase } from '../../test-support/postgres-database'
import { startHttpServer } from './support/https-server'

const email = 'sam@example.com'
const password = 'correct horse battery'

const notes = resource('notes').table('notes').fields({ id: f.integer().readOnly(), title: f.text(), body: f.text().optional() }).primaryKey((r) => r.id)
const notesView = view<typeof notes>('notes').title((r) => r.title).names({ singular: 'Note', plural: 'Notes' })
const overview = page(
  'overview',
  jsx(Page, {
    title: 'Overview',
    children: [jsx(Stat, { label: 'All notes', resource: 'notes' }), jsx(Card, { title: 'About', children: 'Notes the team keeps.' }), jsx(Table, { resource: 'notes', columns: ['title'] })],
  }),
)
// A plugin of the app's bundle, which `/meta` names to everyone: the app loads it before it draws
const pluginApi = (JSON.parse(await readFile(path.join(import.meta.dirname, '../../packages/ui/package.json'), 'utf8')) as { protobase: { pluginApi: number } }).protobase.pluginApi
const pluginFiles: Record<string, { body: string; type: string }> = {
  '/plugins/frame/plugin.json': { body: JSON.stringify({ name: 'frame', api: pluginApi, protobase: '>=0.0.0', entry: './index.js' }), type: 'application/json' },
  '/plugins/frame/index.js': { body: 'export default {}', type: 'text/javascript' },
}

/** What stands in for content in the frozen first frame: placeholders, spinners but the top bar's refresh mark, hidden content and busy regions. */
const standIns = () =>
  [...document.querySelectorAll('#root [data-placeholder], #root .animate-spin, #root .invisible, #root [aria-busy="true"]')]
    .filter((element) => !element.closest('[data-fetching]'))
    .map((element) => `<${element.localName}${typeof element.className === 'string' && element.className ? ` .${element.className.split(' ').slice(0, 4).join('.')}` : ''}>`)

/** The page's headings, each with where it sits in the page, the scroll aside. */
const headings = () => [...document.querySelectorAll('#root h1, #root h2, #root h3')].map((heading) => `${heading.textContent} @${Math.round(heading.getBoundingClientRect().top + window.scrollY)}`)

// Where the frozen frames and the settled pages are kept side by side, to look at
const shots = process.env.ONE_FRAME_SHOTS

// The production shell, as `protobase serve` serves it, in Chromium: with the start cache warm from an earlier visit, a
// page's first frame is the whole page. The shell's entry judges it when the tab's `protobase:first-frame` flag is set:
// one synchronous render and commit, its markup kept and the app unmounted (first-frame.ts). What changes after it, as
// fresh data comes, is not counted here.
describe.skipIf(!(await postgresTemplateReady('auth')))('a page in one frame from a warm cache', () => {
  let shellDir: string
  let store: PostgresDatabase
  let server: Awaited<ReturnType<typeof startHttpServer>>
  let origin: string
  let browser: Browser

  beforeAll(async () => {
    shellDir = await mkdtemp(path.join(tmpdir(), 'one-frame-'))
    await buildShell(shellDir)
    const index = await readFile(path.join(shellDir, 'index.html'))
    server = await startHttpServer()
    origin = `http://127.0.0.1:${server.port}`
    store = await openPostgresDatabase('auth')
    await store.exec(`create table notes (id integer generated always as identity primary key, title text not null, body text);
      insert into notes (title, body) select 'Note ' || n, 'Body of note ' || n from generate_series(1, 60) n`)
    const auth = createAuth({ database: { dialect: store.dialect, type: 'postgres' }, baseURL: origin, secret: 'frame-secret-frame-secret-frame-secret-1', mailer: false })
    await createUser(auth, { email, password })
    const app = createAdmin({ resources: [notes], views: [notesView], pages: [overview], bundlePlugins: ['/plugins/frame/plugin.json'], db: store.db, auth, authenticate: betterAuthAuthenticator({ auth }) })
    server.use(async (request) => {
      const { pathname } = new URL(request.url)
      if (pathname.startsWith('/api/')) return app.fetch(request)
      if (pathname === '/protobase.theme.css') return new Response('', { headers: { 'content-type': 'text/css' } })
      const plugin = pluginFiles[pathname]
      if (plugin) return new Response(plugin.body, { headers: { 'content-type': plugin.type } })
      if (!shellPaths.some((shellPath) => pathname === shellPath || pathname.startsWith(`${shellPath}/`))) return new Response(index, { headers: { 'content-type': 'text/html' } })
      const body = await readFile(path.join(shellDir, pathname)).catch(() => undefined)
      if (!body) return new Response('Not found', { status: 404 })
      return new Response(body, { headers: { 'content-type': pathname.endsWith('.js') ? 'text/javascript' : pathname.endsWith('.css') ? 'text/css' : 'application/octet-stream' } })
    })
    browser = await chromium.launch()
  }, 240_000)

  afterAll(async () => {
    await browser?.close()
    await server?.close()
    await store?.close()
    if (shellDir) await rm(shellDir, { recursive: true, force: true })
  })

  // One sign-in for every test, as many in a row meet the sign-in rate limit
  let session: Awaited<ReturnType<BrowserContext['storageState']>> | undefined
  const signedIn = async (viewport: { width: number; height: number }) => {
    if (!session) {
      const first = await browser.newContext()
      const response = await first.request.post(`${origin}/api/auth/sign-in/email`, { data: { email, password }, headers: { origin } })
      expect(response.ok()).toBe(true)
      session = await first.storageState()
      await first.close()
    }
    return browser.newContext({ viewport, storageState: session })
  }

  // Visits the page once, so the start cache keeps it, then opens it again and gives its frozen first frame
  const reopened = async (context: BrowserContext, address: string, shown: string, name: string) => {
    const page = await context.newPage()
    await page.goto(`${origin}${address}`)
    await page.getByText(shown).first().waitFor()
    // The start cache saves a second after the queries settle
    await page.waitForTimeout(2500)
    if (shots) await page.screenshot({ path: path.join(shots, `${name}-settled.png`) })
    const settledHeadings = await page.evaluate(headings)
    await page.evaluate(() => sessionStorage.setItem('protobase:first-frame', '1'))
    await page.reload()
    await page.locator('#root[data-first-frame="frozen"]').waitFor()
    if (shots) await page.screenshot({ path: path.join(shots, `${name}-first-frame.png`) })
    const first = await page.evaluate((judge) => ({ standIns: (0, eval)(`(${judge})`)() as string[], text: document.getElementById('root')!.innerText, rows: document.querySelectorAll('#root [role="row"]:not([aria-rowindex="1"]), #root ul[aria-label] > li').length, scrollY: window.scrollY }), standIns.toString())
    const firstHeadings = await page.evaluate(headings)
    await page.close()
    // Every heading of the settled page is in the first frame, where the settled page has it
    expect(firstHeadings).toEqual(settledHeadings)
    return first
  }

  const viewports = [
    { name: 'a desktop', viewport: { width: 1280, height: 800 } },
    { name: 'a phone', viewport: { width: 390, height: 844 } },
  ]

  it.each(viewports)('draws the list whole in its first commit on $name', async ({ viewport }) => {
    const context = await signedIn(viewport)
    const first = await reopened(context, '/notes', 'Note 1', `list-${viewport.width}`)
    expect(first.standIns).toEqual([])
    expect(first.text).toContain('Note 1')
    // The rows that fill the view, not the few a list draws before it knows its height
    expect(first.rows).toBeGreaterThanOrEqual(10)
    await context.close()
  })

  it.each(viewports)('draws a composed page whole in its first commit on $name', async ({ viewport }) => {
    const context = await signedIn(viewport)
    const first = await reopened(context, '/overview', 'Notes the team keeps.', `composed-${viewport.width}`)
    expect(first.standIns).toEqual([])
    expect(first.text).toContain('All notes')
    expect(first.text).toContain('60')
    expect(first.text).toContain('Note 1')
    await context.close()
  })

  it.each(viewports)('draws a record whole in its first commit on $name', async ({ viewport }) => {
    const context = await signedIn(viewport)
    const page = await context.newPage()
    await page.goto(`${origin}/`)
    await page.getByText('Note 1', { exact: true }).first().click()
    await page.waitForURL((url) => url.pathname.split('/').filter(Boolean).length >= 2)
    const address = new URL(page.url()).pathname + new URL(page.url()).search
    await page.close()
    const first = await reopened(context, address, 'Body', `record-${viewport.width}`)
    expect(first.standIns).toEqual([])
    expect(first.text).toContain('Note 1')
    expect(first.text).toContain('Body')
    await context.close()
  })
})
