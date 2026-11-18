import { chromium, errors as playwrightErrors } from 'playwright'
import { layoutTree } from './layout-tree.mjs'
import { routeFiles } from './routed-files.mjs'

export const viewports = { desktop: { width: 1280, height: 720 }, phone: { width: 360, height: 740 } }

// The stories' data and "6 days ago" labels are drawn from the clock, so every run sees the same day.
const now = new Date('2026-10-12T09:00:00Z')

// The requests each page has in flight, which openStory counts: Playwright's networkidle is reached once and stays.
const inFlight = new WeakMap()

// Resolves once the page has no request in flight, or rejects after 5 s.
const idle = async (page) => {
  const deadline = Date.now() + 5000
  while ((inFlight.get(page) ?? 0) > 0) {
    if (Date.now() > deadline) throw new playwrightErrors.TimeoutError('requests still in flight after 5 s')
    await page.waitForTimeout(50)
  }
}

// Waits for `waiting`, at most 5 s, for a story that keeps at it.
const atMost5s = (waiting) =>
  waiting.catch((error) => {
    if (!(error instanceof playwrightErrors.TimeoutError)) throw error
  })

// The layout once it stops changing: data loads, pages' code loads lazily and charts draw after the story first
// renders, so a layout only counts once no request is in flight and nothing on the page says it is still loading
// (`aria-busy`, as a page's skeleton does), each for 5 s at most.
export const settledTree = async (page) => {
  let last = ''
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await page.waitForTimeout(250)
    await atMost5s(idle(page))
    await atMost5s(page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), null, { timeout: 5000 }))
    const tree = await page.evaluate(layoutTree)
    if (tree === last) return tree
    last = tree
  }
  throw new Error('The layout kept changing for 10 seconds')
}

// The story rendered in a new page of its own context, which the caller closes. A story that does not render fails with
// its name and the page's console errors and failed requests.
export const openStory = async (browser, storybookDir, shot) => {
  const context = await browser.newContext({ viewport: viewports[shot.viewport] })
  const base = await routeFiles(context, storybookDir)
  const page = await context.newPage()
  inFlight.set(page, 0)
  page.on('request', () => inFlight.set(page, inFlight.get(page) + 1))
  for (const ended of ['requestfinished', 'requestfailed']) page.on(ended, () => inFlight.set(page, inFlight.get(page) - 1))
  const logged = []
  page.on('console', (message) => message.type() === 'error' && logged.push(message.text()))
  page.on('requestfailed', (request) => logged.push(`${request.failure()?.errorText} ${request.url()}`))
  await page.clock.setFixedTime(now)
  await page.goto(`${base}/iframe.html?id=${shot.story}&viewMode=story`)
  const rendered = await page.waitForFunction(() => document.querySelector('#storybook-root')?.children.length > 0, null, { timeout: 30_000 }).then(
    () => true,
    (error) => {
      if (error instanceof playwrightErrors.TimeoutError) return false
      throw error
    },
  )
  if (rendered) return page
  await context.close()
  throw new Error([`Story ${shot.story} did not render within 30 s`, ...logged].join('\n  '))
}

/**
 * Opens each story of `shots` ({ name, story, viewport }) in the built Storybook in `storybookDir`, adds `css` after
 * the app's stylesheet as the app adds a plugin's, and gives its layout tree by name. With `screenshots`, a function
 * from a name to a file, it also saves a screenshot of each.
 */
export const storyLayouts = async ({ storybookDir, css, shots, screenshots }) => {
  const browser = await chromium.launch()
  const trees = {}
  for (const shot of shots) {
    const page = await openStory(browser, storybookDir, shot)
    await page.addStyleTag({ content: css })
    trees[shot.name] = await settledTree(page)
    if (screenshots) await page.screenshot({ path: screenshots(shot.name) })
    await page.context().close()
  }
  await browser.close()
  return trees
}
