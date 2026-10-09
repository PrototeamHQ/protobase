import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { serveStatic } from './static-server.mjs'

/**
 * Opens every page of the documentation site, and every Storybook story a page embeds, and fails on a console error,
 * an uncaught exception, a failed request or a story that does not render. Without BASE it serves the local build
 * (`pnpm docs:build` first); BASE=https://docs.protobase.net checks the live site.
 */
const dist = fileURLToPath(new URL('../website/dist', import.meta.url))
const local = process.env.BASE ? undefined : await serveStatic(dist)
const base = process.env.BASE ?? local.base

const sitemap = local ? await readFile(`${dist}/sitemap-0.xml`, 'utf8') : await (await fetch(new URL('/sitemap-0.xml', base))).text()
const paths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, url]) => new URL(url).pathname)
if (paths.length === 0) throw new Error('The sitemap lists no pages')

const browser = await chromium.launch()
const problems = []
const report = (label, found) => {
  console.log(`${found.length === 0 ? 'PASS' : 'FAIL'} ${label}${found.map((problem) => `\n  ${problem}`).join('')}`)
  if (found.length > 0) process.exitCode = 1
}

try {
  const page = await browser.newPage()
  page.on('console', (message) => message.type() === 'error' && problems.push(`console: ${message.text()}`))
  page.on('pageerror', (error) => problems.push(`exception: ${error.message}`))
  page.on('requestfailed', (request) => problems.push(`request failed: ${request.url()}`))
  page.on('response', (response) => response.status() >= 400 && problems.push(`${response.status()}: ${response.url()}`))
  const stories = new Set()
  for (const path of paths) {
    problems.length = 0
    await page.goto(new URL(path, base).href, { waitUntil: 'networkidle' })
    for (const src of await page.$$eval('iframe[src]', (frames) => frames.map((frame) => frame.getAttribute('src')))) stories.add(src)
    report(path, [...problems])
  }
  for (const src of stories) {
    problems.length = 0
    await page.goto(new URL(src, base).href, { waitUntil: 'networkidle' })
    const rendered = await page.waitForFunction(() => document.querySelector('#storybook-root')?.childElementCount > 0, null, { timeout: 15_000 }).then(() => true, () => false)
    if (!rendered) problems.push('the story did not render')
    if (await page.evaluate(() => document.body.classList.contains('sb-show-errordisplay'))) problems.push('the story shows an error')
    report(`story ${src}`, [...problems])
  }
} finally {
  await browser.close()
  local?.close()
}
