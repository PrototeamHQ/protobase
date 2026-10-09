import { join } from 'node:path'
import { chromium } from 'playwright'
import { serveStatic } from './static-server.mjs'

/** Runs the play functions of every story tagged "play" in the built Storybook and fails on any thrown error. */
const { base, close } = await serveStatic(join(import.meta.dirname, '..', 'storybook-static'))
const index = await (await fetch(`${base}/index.json`)).json()
const stories = Object.values(index.entries).filter((entry) => entry.type === 'story' && entry.tags.includes('play'))
if (stories.length === 0) throw new Error('No stories tagged "play" found in storybook-static/index.json')

const browser = await chromium.launch()

// The error a story's play function raised, or undefined when it rendered and played.
const playStory = async (story) => {
  // The Storybook viewport toolbar does not apply when an iframe is opened directly, so phone stories get a phone-sized page.
  const page = await browser.newPage({ viewport: story.tags.includes('phone') ? { width: 360, height: 740 } : { width: 1280, height: 720 } })
  await page.addInitScript(() => {
    const timer = setInterval(() => {
      const channel = window.__STORYBOOK_ADDONS_CHANNEL__
      if (!channel) return
      clearInterval(timer)
      window.__sbEvents = []
      for (const name of ['storyRendered', 'playFunctionThrewException', 'storyThrewException', 'storyErrored', 'storyMissing']) channel.on(name, (payload) => window.__sbEvents.push({ name, payload }))
    }, 5)
  })
  await page.goto(`${base}/iframe.html?id=${story.id}&viewMode=story`)
  await page.waitForFunction(() => window.__sbEvents?.length > 0, null, { timeout: 30_000 })
  const events = await page.evaluate(() => window.__sbEvents.map((event) => ({ name: event.name, message: String(event.payload?.message ?? event.payload?.description ?? '') })))
  await page.close()
  return events.find((event) => event.name !== 'storyRendered')
}

// Four pages at a time: a story mostly waits on rendering. Results print in story order.
const pages = 4
const errors = new Array(stories.length)
let next = 0
await Promise.all(Array.from({ length: pages }, async () => {
  while (next < stories.length) {
    const i = next++
    errors[i] = await playStory(stories[i])
  }
}))
await browser.close()
close()

let failed = 0
for (const [i, story] of stories.entries()) {
  const error = errors[i]
  console.log(`${error ? 'FAIL' : 'PASS'} ${story.title} / ${story.name}${error ? `\n  ${error.name}: ${error.message}` : ''}`)
  if (error) failed += 1
}
if (failed > 0) process.exitCode = 1
