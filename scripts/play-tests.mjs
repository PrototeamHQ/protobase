import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium, errors as playwrightErrors } from 'playwright'
import { serveStatic } from './static-server.mjs'

/** Runs the play functions of every story tagged "play" in the built Storybook and fails on any thrown error. */
const { base, close } = await serveStatic(join(import.meta.dirname, '..', 'storybook-static'))
const index = await (await fetch(`${base}/index.json`)).json()
const stories = Object.values(index.entries).filter((entry) => entry.type === 'story' && entry.tags.includes('play'))
if (stories.length === 0) throw new Error('No stories tagged "play" found in storybook-static/index.json')

const browser = await chromium.launch()
// Headless Chromium hides scrollbars; a story tagged "scrollbars" gets a browser whose scrollbars take room, as they do
// on Windows and Linux.
const scrollbars = stories.some((story) => story.tags.includes('scrollbars')) ? await chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] }) : undefined

// The error a story's play function raised, or undefined when it rendered and played.
const playStory = async (story) => {
  // The Storybook viewport toolbar does not apply when an iframe is opened directly, so phone stories get a phone-sized page.
  // Times show in the viewer's zone, so every page has the same one, whatever the machine's, and one that is not UTC.
  const viewport = story.tags.includes('phone') ? { width: 360, height: 740 } : { width: 1280, height: 720 }
  const page = await (story.tags.includes('scrollbars') ? scrollbars : browser).newPage({ viewport, timezoneId: 'Europe/Amsterdam' })
  // Storybook installs its channel by assigning this global; an accessor attaches the listeners in that same assignment,
  // so no event is sent before they are, and each channel installed after the first gets them too. The last render phase
  // says where a story that sends no event stopped, such as "playing" for a play function that never ends.
  await page.addInitScript(() => {
    window.__sbEvents = []
    window.__sbPhase = undefined
    let installed
    Object.defineProperty(window, '__STORYBOOK_ADDONS_CHANNEL__', {
      configurable: true,
      get: () => installed,
      set: (channel) => {
        installed = channel
        if (!channel) return
        window.__sbPhase ??= 'channel installed'
        channel.on('storyRenderPhaseChanged', ({ newPhase }) => { window.__sbPhase = newPhase })
        for (const name of ['storyRendered', 'playFunctionThrewException', 'storyThrewException', 'storyErrored', 'storyMissing']) channel.on(name, (payload) => window.__sbEvents.push({ name, payload }))
      },
    })
  })
  // A story whose file fails to load sends storyMissing with only its id; the cause goes to the console, so a failure
  // without a message reports the page's console errors and failed requests instead.
  const logged = []
  page.on('console', (message) => message.type() === 'error' && logged.push(message.text()))
  page.on('requestfailed', (request) => logged.push(`${request.failure()?.errorText} ${request.url()}`))
  await page.goto(`${base}/iframe.html?id=${story.id}&viewMode=story`)
  // A page whose Storybook runtime never loaded sends no event at all; it fails with the page's console errors and failed
  // requests, so an abort by a host network change plays once more like any other.
  const settled = await page.waitForFunction(() => window.__sbEvents?.length > 0, null, { timeout: 30_000 }).catch((error) => {
    if (error instanceof playwrightErrors.TimeoutError) return undefined
    throw error
  })
  // A story whose own message hides the cause, such as a module import that failed, still says whether the network
  // changed under it.
  const networkChanged = () => logged.some((line) => line.includes('net::ERR_NETWORK_CHANGED'))
  if (!settled) {
    const phase = await page.evaluate(() => window.__sbPhase ?? 'no channel installed')
    await page.close()
    return { name: 'noStoryEvent', message: [`Storybook sent no event within 30 s (last phase: ${phase})`, ...logged].join('\n  '), networkChanged: networkChanged() }
  }
  const events = await page.evaluate(() => window.__sbEvents.map((event) => ({ name: event.name, message: String(event.payload?.message ?? event.payload?.description ?? '') })))
  await page.close()
  const error = events.find((event) => event.name !== 'storyRendered')
  if (!error) return undefined
  return { ...error, message: error.message || logged.join('\n  '), networkChanged: networkChanged() }
}

// Chromium aborts every request in flight when the host's network changes, such as another job on the CI host starting a
// container network, which changes it several times in a row; a story whose files were aborted that way plays again, up
// to three times in all, a second apart so the changes can settle; any other failure stands.
const playStoryWithRetry = async (story) => {
  let error = await playStory(story)
  for (let tries = 1; error?.networkChanged && tries < 3; tries += 1) {
    await sleep(1_000)
    error = await playStory(story)
  }
  return error
}

// Four pages at a time: a story mostly waits on rendering. Results print in story order.
const pages = 4
const errors = new Array(stories.length)
let next = 0
await Promise.all(Array.from({ length: pages }, async () => {
  while (next < stories.length) {
    const i = next++
    errors[i] = await playStoryWithRetry(stories[i])
  }
}))
await browser.close()
await scrollbars?.close()
close()

let failed = 0
for (const [i, story] of stories.entries()) {
  const error = errors[i]
  console.log(`${error ? 'FAIL' : 'PASS'} ${story.title} / ${story.name}${error ? `\n  ${error.name}: ${error.message}` : ''}`)
  if (error) failed += 1
}
if (failed > 0) process.exitCode = 1
