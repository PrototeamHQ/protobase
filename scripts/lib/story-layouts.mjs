import { chromium } from 'playwright'
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
    const page = await browser.newPage({ viewport: viewports[shot.viewport] })
    await page.clock.setFixedTime(now)
    await page.goto(`${base}/iframe.html?id=${shot.story}&viewMode=story`)
    await page.waitForFunction(() => document.querySelector('#storybook-root')?.children.length > 0, null, { timeout: 30_000 })
    await page.addStyleTag({ content: css })
    trees[shot.name] = await settledTree(page)
    if (screenshots) await page.screenshot({ path: screenshots(shot.name) })
    await page.close()
  }
  await browser.close()
  close()
  return trees
}
