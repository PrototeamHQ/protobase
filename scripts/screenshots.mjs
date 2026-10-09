import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { serveStatic } from './static-server.mjs'

const root = join(import.meta.dirname, '..', 'storybook-static')
const live = process.argv.includes('--live')
const outDir = join(import.meta.dirname, '..', 'screenshots', live ? 'live' : '')

const { base, close } = await serveStatic(root, live ? (process.env.PROTOBASE_API ?? 'http://localhost:8787') : undefined)

const index = await (await fetch(`${base}/index.json`)).json()
const stories = Object.values(index.entries).filter((entry) => entry.type === 'story' && (live ? entry.title.startsWith('Live') : entry.tags.includes('website')))
if (stories.length === 0) throw new Error(live ? 'No Live stories found in storybook-static/index.json' : 'No stories tagged "website" found in storybook-static/index.json')

await mkdir(outDir, { recursive: true })
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: 'light' })

for (const story of stories) {
  const page = await context.newPage()
  await page.goto(`${base}/iframe.html?id=${story.id}&viewMode=story&globals=theme:light`)
  await page.waitForSelector('#storybook-root > *')
  await page.evaluate(() => document.fonts.ready)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(live ? 1500 : 600)
  await page.screenshot({ path: join(outDir, `${story.id.split('--')[1]}.png`) })
  await page.close()
}

await browser.close()
close()
