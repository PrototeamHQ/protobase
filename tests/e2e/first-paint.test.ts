import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium, type Browser } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { f, resource, view } from '@protobase/schema'
import { createAdmin, createUser } from '@protobase/server'
import { betterAuthAuthenticator, createAuth } from '@protobase/server/internal'
import { buildShell, shellPaths } from '../../packages/cli/src/build/shell'
import { openPostgresDatabase, postgresTemplateReady, type PostgresDatabase } from '../../test-support/postgres-database'
import { framesFrom, type Frame } from './support/trace-frames'
import { startHttpServer } from './support/https-server'

const email = 'sam@example.com'
const password = 'correct horse battery'
// How long a slow network holds the app's entry script, which the app starts from
const slowScriptMs = 1500

const notes = resource('notes').table('notes').fields({ id: f.integer().readOnly(), title: f.text() }).primaryKey((r) => r.id)
const notesView = view<typeof notes>('notes').title((r) => r.title).names({ singular: 'Note', plural: 'Notes' })

type Rgb = [number, number, number]
const near = (a: Rgb, b: Rgb) => a.every((channel, index) => Math.abs(channel - b[index]!) <= 6)
const rgbOf = (css: string) => css.match(/\d+/g)!.slice(0, 3).map(Number) as Rgb

// The production shell, as `protobase serve` serves it, over an app with a note, in Chromium: each frame from the
// navigation to the first page is either the start screen, in the theme's background, or that page.
describe.skipIf(!(await postgresTemplateReady('auth')))('from the first paint to the first page', () => {
  let shellDir: string
  let store: PostgresDatabase
  let server: Awaited<ReturnType<typeof startHttpServer>>
  let origin: string
  let browser: Browser
  let slow = false

  beforeAll(async () => {
    shellDir = await mkdtemp(path.join(tmpdir(), 'first-paint-'))
    await buildShell(shellDir)
    const index = await readFile(path.join(shellDir, 'index.html'))
    // Only the entry is held, so the stylesheets, which the first paint waits for, do not queue behind the scripts
    const entry = /<script type="module" crossorigin src="([^"]+)">/.exec(index.toString())![1]
    server = await startHttpServer()
    origin = `http://127.0.0.1:${server.port}`
    store = await openPostgresDatabase('auth')
    await store.exec(`create table notes (id integer generated always as identity primary key, title text not null); insert into notes (title) values ('Groceries')`)
    const auth = createAuth({ database: { dialect: store.dialect, type: 'postgres' }, baseURL: origin, secret: 'paint-secret-paint-secret-paint-secret-1', mailer: false })
    await createUser(auth, { email, password })
    const app = createAdmin({ resources: [notes], views: [notesView], db: store.db, auth, authenticate: betterAuthAuthenticator({ auth }) })
    server.use(async (request) => {
      const { pathname } = new URL(request.url)
      if (pathname.startsWith('/api/')) return app.fetch(request)
      if (pathname === '/protobase.theme.css') return new Response('', { headers: { 'content-type': 'text/css' } })
      if (!shellPaths.some((shellPath) => pathname === shellPath || pathname.startsWith(`${shellPath}/`))) return new Response(index, { headers: { 'content-type': 'text/html' } })
      const script = pathname.endsWith('.js')
      if (pathname === entry && slow) await sleep(slowScriptMs)
      const body = await readFile(path.join(shellDir, pathname)).catch(() => undefined)
      if (!body) return new Response('Not found', { status: 404 })
      return new Response(body, { headers: { 'content-type': script ? 'text/javascript' : pathname.endsWith('.css') ? 'text/css' : 'application/octet-stream' } })
    })
    browser = await chromium.launch()
  }, 240_000)

  afterAll(async () => {
    await browser?.close()
    await server?.close()
    await store?.close()
    if (shellDir) await rm(shellDir, { recursive: true, force: true })
  })

  // Opens the app in a new browser of `theme`, signed in or not, and gives each frame from the navigation on, the
  // theme's background and the browser, once the first page has drawn.
  const open = async (theme: 'light' | 'dark', signedIn: boolean) => {
    const context = await browser.newContext({ colorScheme: theme, viewport: { width: 1024, height: 700 } })
    if (signedIn) {
      const response = await context.request.post(`${origin}/api/auth/sign-in/email`, { data: { email, password }, headers: { origin } })
      expect(response.ok()).toBe(true)
    }
    const page = await context.newPage()
    await browser.startTracing(page, { screenshots: true, categories: ['devtools.timeline', 'disabled-by-default-devtools.screenshot'] })
    await page.goto(`${origin}/`)
    await (signedIn ? page.getByText('Groceries') : page.getByRole('textbox').first()).waitFor()
    // The frames the first page settles in
    await page.waitForTimeout(500)
    const background = rgbOf(await page.evaluate(() => getComputedStyle(document.body).backgroundColor))
    const startScreen = await page.evaluate(() => document.getElementById('pb-start') !== null)
    const frames = await framesFrom(await browser.stopTracing(), context)
    return { context, frames, background, startScreen }
  }

  // A frame is the start screen, its corners in the background, or the first page, its corners as in the last frame
  const strayFrames = (frames: Frame[], background: Rgb) => {
    const page = frames.at(-1)!.corners
    return frames.filter((frame) => !frame.corners.every((corner) => near(corner, background)) && !frame.corners.every((corner, index) => near(corner, page[index]!)))
  }

  const cases = [
    { theme: 'dark', signedIn: false, page: 'the sign-in page' },
    { theme: 'dark', signedIn: true, page: 'the home page' },
    { theme: 'light', signedIn: false, page: 'the sign-in page' },
    { theme: 'light', signedIn: true, page: 'the home page' },
  ] as const

  it.each(cases)('in the $theme theme shows only the start screen until $page', async ({ theme, signedIn }) => {
    const { context, frames, background, startScreen } = await open(theme, signedIn)
    expect(frames.length).toBeGreaterThan(1)
    expect(strayFrames(frames, background)).toEqual([])
    expect(startScreen).toBe(false)
    await context.close()
  })

  it("keeps the start screen up with its spinner while the app's script is slow", async () => {
    slow = true
    const { context, frames, background } = await open('dark', false).finally(() => (slow = false))
    expect(strayFrames(frames, background)).toEqual([])
    // The spinner shows while the scripts are still on their way
    expect(frames.some((frame) => frame.at < slowScriptMs && frame.markedCentre && frame.corners.every((corner) => near(corner, background)))).toBe(true)
    await context.close()
  })
})
