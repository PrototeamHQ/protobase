import { setTimeout as sleep } from 'node:timers/promises'
import { chromium, errors as playwrightErrors } from 'playwright'
import { serveStatic } from '../static-server.mjs'
import { layoutTree } from './layout-tree.mjs'

export const viewports = { desktop: { width: 1280, height: 720 }, phone: { width: 360, height: 740 } }

// The stories' data and "6 days ago" labels are drawn from the clock, so every run sees the same day.
const now = new Date('2026-10-12T09:00:00Z')

// The layout once it stops changing: data loads and charts draw after the story first renders.
const settledTree = async (page) => {
  let last = ''
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await page.waitForTimeout(250)
    const tree = await page.evaluate(layoutTree)
    if (tree === last) return tree
    last = tree
  }
  throw new Error('The layout kept changing for 10 seconds')
}

// The story rendered in a new page, which the caller closes. Chromium aborts every request in flight when the host's
// network changes, such as another job on the CI host starting a container network; a story whose files were aborted
// that way opens again, up to three times in all, a second apart so the changes can settle, as play-tests.mjs does. A
// story that does not render otherwise fails with the page's console errors and failed requests.
const openStory = async (browser, base, shot) => {
  for (let tries = 1; ; tries += 1) {
    const page = await browser.newPage({ viewport: viewports[shot.viewport] })
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
    await page.close()
    const networkChanged = logged.some((line) => line.includes('net::ERR_NETWORK_CHANGED'))
    if (!networkChanged || tries === 3) throw new Error([`Story ${shot.story} did not render within 30 s`, ...logged].join('\n  '))
    await sleep(1_000)
  }
}

/**
 * Opens each story of `shots` ({ name, story, viewport }) in the built Storybook in `storybookDir`, adds `css` after
 * the app's stylesheet as the app adds a plugin's, and gives its layout tree by name. With `screenshots`, a function
 * from a name to a file, it also saves a screenshot of each.
 */
export const storyLayouts = async ({ storybookDir, css, shots, screenshots }) => {
  const { base, close } = await serveStatic(storybookDir)
  const browser = await chromium.launch()
  const trees = {}
  for (const shot of shots) {
    const page = await openStory(browser, base, shot)
    await page.addStyleTag({ content: css })
    trees[shot.name] = await settledTree(page)
    if (screenshots) await page.screenshot({ path: screenshots(shot.name) })
    await page.close()
  }
  await browser.close()
  close()
  return trees
}
