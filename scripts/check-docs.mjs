import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { serveStatic } from './static-server.mjs'

/**
 * Opens every page of the documentation site, and every Storybook story a page embeds, and fails on a console error,
 * an uncaught exception, a failed request or a story that does not render. Without BASE it serves the local build
 * (`bun run docs:build` first); BASE=https://docs.protobase.net checks the live site.
 */
const dist = fileURLToPath(new URL('../website/dist', import.meta.url))
const local = process.env.BASE ? undefined : await serveStatic(dist)
const base = process.env.BASE ?? local.base

const sitemap = local ? await readFile(`${dist}/sitemap-0.xml`, 'utf8') : await (await fetch(new URL('/sitemap-0.xml', base))).text()
const paths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, url]) => new URL(url).pathname)
if (paths.length === 0) throw new Error('The sitemap lists no pages')

const browser = await chromium.launch()
const report = (label, found) => {
  console.log(`${found.length === 0 ? 'PASS' : 'FAIL'} ${label}${found.map((problem) => `\n  ${problem}`).join('')}`)
  if (found.length > 0) process.exitCode = 1
}

// Four pages at a time, in one context so they share its cache: a page mostly waits for the network to go idle. Each
// url gets the problems its page met and what `inspect` returns once the network is idle, in the order of `urls`. A
// visit during which the host's network changed (other jobs on a shared runner add and drop Docker networks, and
// Chromium then aborts every request in flight, even to localhost) says nothing about the site, so it is made again.
const pages = 4
const visitsPerUrl = 3
const visitAll = async (context, urls, inspect) => {
  const visits = new Array(urls.length)
  let next = 0
  await Promise.all(Array.from({ length: pages }, async () => {
    const page = await context.newPage()
    const problems = []
    let networkChanged = false
    page.on('console', (message) => message.type() === 'error' && problems.push(`console: ${message.text()}`))
    page.on('pageerror', (error) => problems.push(`exception: ${error.message}`))
    page.on('requestfailed', (request) => {
      if (request.failure()?.errorText === 'net::ERR_NETWORK_CHANGED') networkChanged = true
      problems.push(`request failed: ${request.url()}`)
    })
    page.on('response', (response) => response.status() >= 400 && problems.push(`${response.status()}: ${response.url()}`))
    while (next < urls.length) {
      const i = next++
      for (let visit = 1; visit <= visitsPerUrl; visit++) {
        problems.length = 0
        networkChanged = false
        await page.goto(new URL(urls[i], base).href, { waitUntil: 'networkidle' })
        const found = await inspect(page, problems)
        visits[i] = { problems: [...problems], found }
        if (!networkChanged) break
      }
    }
    await page.close()
  }))
  return visits
}

try {
  const context = await browser.newContext()
  const pageVisits = await visitAll(context, paths, (page) => page.$$eval('iframe[src]', (frames) => frames.map((frame) => frame.getAttribute('src'))))
  pageVisits.forEach((visit, i) => report(paths[i], visit.problems))
  const stories = [...new Set(pageVisits.flatMap((visit) => visit.found))]
  const storyVisits = await visitAll(context, stories, async (page, problems) => {
    const rendered = await page.waitForFunction(() => document.querySelector('#storybook-root')?.childElementCount > 0, null, { timeout: 15_000 }).then(() => true, () => false)
    if (!rendered) problems.push('the story did not render')
    if (await page.evaluate(() => document.body.classList.contains('sb-show-errordisplay'))) problems.push('the story shows an error')
  })
  storyVisits.forEach((visit, i) => report(`story ${stories[i]}`, visit.problems))
} finally {
  await browser.close()
  local?.close()
}
