import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium, errors as playwrightErrors } from 'playwright'
import { routeFiles } from './lib/routed-files.mjs'
import { deadline } from './play-tests/deadline.mjs'
import { parseShard, shardOf } from './play-tests/shard.mjs'

/**
 * Runs the play functions of every story tagged "play" in the built Storybook and fails on any thrown error; with
 * `--shard <index>/<count>`, only that shard's stories (play-tests/shard.mjs).
 */
const storybookDir = join(import.meta.dirname, '..', 'storybook-static')
const index = JSON.parse(await readFile(join(storybookDir, 'index.json'), 'utf8'))
const playable = Object.values(index.entries).filter((entry) => entry.type === 'story' && entry.tags.includes('play'))
if (playable.length === 0) throw new Error('No stories tagged "play" found in storybook-static/index.json')
const stories = shardOf(playable, parseShard(process.argv))

const browser = await chromium.launch()
// Headless Chromium hides scrollbars; a story tagged "scrollbars" gets a browser whose scrollbars take room, as they do
// on Windows and Linux.
const scrollbars = stories.some((story) => story.tags.includes('scrollbars')) ? await chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] }) : undefined

// A story that has not finished within this time fails, whatever call it is stuck in, and the run goes on with the others.
const storyDeadline = 90_000

// The error a story's play function raised, or undefined when it rendered and played. It keeps `state` up to date: the
// step it is in, Storybook's last render phase and the context it opened, which the caller closes.
const playStory = async (story, state) => {
  // The Storybook viewport toolbar does not apply when an iframe is opened directly, so phone stories get a phone-sized page,
  // and "keyboard" stories the part of an iPhone 17 above its keyboard, which the app shrinks the page to.
  // Times show in the viewer's zone, so every page has the same one, whatever the machine's, and one that is not UTC.
  const viewport = story.tags.includes('keyboard') ? { width: 402, height: 478 } : story.tags.includes('phone') ? { width: 360, height: 740 } : { width: 1280, height: 720 }
  state.step = 'opening a browser context'
  const context = await (story.tags.includes('scrollbars') ? scrollbars : browser).newContext({ viewport, timezoneId: 'Europe/Amsterdam' })
  state.context = context
  const base = await routeFiles(context, storybookDir)
  const page = await context.newPage()
  // The page reports Storybook's events and render phases to this script as they happen, so reading them never waits on
  // a page whose main thread is stuck.
  const events = []
  let settle
  const settled = new Promise((resolve) => { settle = resolve })
  await page.exposeFunction('__sbReport', (report) => {
    if (report.phase) {
      state.phase = report.phase
      return
    }
    events.push(report)
    settle()
  })
  // Storybook installs its channel by assigning this global; an accessor attaches the listeners in that same assignment,
  // so no event is sent before they are, and each channel installed after the first gets them too. The last render phase
  // says where a story that sends no event stopped, such as "playing" for a play function that never ends.
  await page.addInitScript(() => {
    let installed
    Object.defineProperty(window, '__STORYBOOK_ADDONS_CHANNEL__', {
      configurable: true,
      get: () => installed,
      set: (channel) => {
        installed = channel
        if (!channel) return
        window.__sbReport({ phase: 'channel installed' })
        channel.on('storyRenderPhaseChanged', ({ newPhase }) => window.__sbReport({ phase: newPhase }))
        for (const name of ['storyRendered', 'playFunctionThrewException', 'storyThrewException', 'storyErrored', 'storyMissing']) {
          channel.on(name, (payload) => window.__sbReport({ name, message: String(payload?.message ?? payload?.description ?? '') }))
        }
      },
    })
  })
  // A story whose file fails to load sends storyMissing with only its id; the cause goes to the console, so a failure
  // without a message reports the page's console errors and failed requests instead.
  const logged = []
  page.on('console', (message) => message.type() === 'error' && logged.push(message.text()))
  page.on('requestfailed', (request) => logged.push(`${request.failure()?.errorText} ${request.url()}`))
  state.step = 'loading the page'
  await page.goto(`${base}/iframe.html?id=${story.id}&viewMode=story`)
  // A page whose Storybook runtime never loaded sends no event at all; it fails with the page's console errors and failed
  // requests.
  state.step = 'waiting for a story event'
  const { done } = await deadline(settled, 30_000)
  if (!done) return { name: 'noStoryEvent', message: [`Storybook sent no event within 30 s (last phase: ${state.phase})`, ...logged].join('\n  ') }
  const error = events.find((event) => event.name !== 'storyRendered')
  if (!error) return
  return { ...error, message: error.message || logged.join('\n  ') }
}

// Plays a story within the deadline, then closes its context without waiting on that for long. A story stuck past the
// deadline, or in a Playwright call that timed out, fails with its id, the step it stopped in and the render phase.
const runStory = async (story) => {
  const state = { step: 'starting', phase: 'no channel installed', context: undefined }
  const stopped = () => `${story.id} stopped while ${state.step} (last phase: ${state.phase})`
  const error = await deadline(playStory(story, state), storyDeadline).then(
    ({ done, value }) => (done ? value : { name: 'storyTimedOut', message: `${stopped()} and did not finish within ${storyDeadline / 1000} s` }),
    (error) => {
      if (error instanceof playwrightErrors.TimeoutError) return { name: 'playwrightTimeout', message: `${stopped()}: ${error.message}` }
      throw error
    },
  )
  if (state.context) await deadline(state.context.close(), 10_000)
  return error
}

// Four pages at a time: a story mostly waits on rendering. Each result prints as soon as its story finishes, so a run
// that stops still shows what it got through.
const pages = 4
let next = 0
let failed = 0
await Promise.all(Array.from({ length: pages }, async () => {
  while (next < stories.length) {
    const story = stories[next++]
    const started = performance.now()
    const error = await runStory(story)
    const seconds = ((performance.now() - started) / 1000).toFixed(1)
    console.log(`${error ? 'FAIL' : 'PASS'} ${story.title} / ${story.name} (${seconds} s)${error ? `\n  ${error.name}: ${error.message}` : ''}`)
    if (error) failed += 1
  }
}))
console.log(`${stories.length - failed} passed, ${failed} failed`)
// A browser stuck on a page it was told to close must not keep the run alive: the run exits once the browsers had time
// to close.
await deadline(Promise.all([browser.close(), scrollbars?.close()]), 10_000)
process.exit(failed > 0 ? 1 : 0)
