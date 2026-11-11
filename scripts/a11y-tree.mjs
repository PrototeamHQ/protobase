import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { axProblems, fixedText, hiddenFocus } from './a11y-tree/ax-problems.mjs'
import { openStory, settledTree } from './lib/story-layouts.mjs'

/**
 * Checks what a screen reader and a larger text size meet on the main pages in the built Storybook (storybook-static),
 * on desktop and phone: Chromium's accessibility tree has no link or button without a name, one main landmark and no
 * heading that skips a level (a11y-tree/ax-problems.mjs), all text grows when the root text size doubles, and each
 * link and button shows an outline when focused in forced colors.
 */
const root = join(import.meta.dirname, '..')
const storybookDir = join(root, 'storybook-static')
if (!existsSync(join(storybookDir, 'index.json'))) throw new Error('There is no built Storybook in storybook-static; run `bun run build-storybook` first')

const pages = [
  { story: 'guides-bike-shop--step-3', page: 'list with filters' },
  { story: 'list-page-displays--cards', page: 'list with cards' },
  { story: 'guides-bike-shop--step-5', page: 'record with actions' },
]
const shots = pages.flatMap(({ story, page }) => ['desktop', 'phone'].map((viewport) => ({ name: `${page} (${viewport})`, story, viewport })))

// Each shown element with text of its own, but text hidden from the reader, such as a chart's measuring box, by a key kept on the element, so the sizes after a change pair up with those
// before; an element drawn anew in between gets no size after.
const textSizes = () => {
  window.__pbTextKeys ??= new WeakMap()
  const keys = window.__pbTextKeys
  window.__pbTextCount ??= 0
  return [...document.querySelectorAll('body *')].flatMap((element) => {
    const text = [...element.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent.trim()).join(' ').trim()
    if (text === '' || element.getClientRects().length === 0 || element.closest('[aria-hidden="true"]')) return []
    if (!keys.has(element)) keys.set(element, (window.__pbTextCount += 1))
    return [{ key: keys.get(element), text: text.slice(0, 40), size: Number.parseFloat(getComputedStyle(element).fontSize) }]
  })
}

// Each shown link and button's outline style and width while focused from the keyboard, as `:focus-visible` matches it
const focusOutlines = () =>
  [...document.querySelectorAll('a[href], button')].flatMap((element) => {
    if (element.getClientRects().length === 0 || element.closest('[aria-hidden="true"]')) return []
    element.focus()
    if (!element.matches(':focus-visible')) return []
    const style = getComputedStyle(element)
    return [{ text: (element.textContent.trim() || element.getAttribute('aria-label') || element.tagName).slice(0, 40), outline: style.outlineStyle, outlineWidth: Number.parseFloat(style.outlineWidth) }]
  })

const browser = await chromium.launch()
let failed = false
for (const shot of shots) {
  const page = await openStory(browser, storybookDir, shot)
  await settledTree(page)
  const cdp = await page.context().newCDPSession(page)
  const { nodes } = await cdp.send('Accessibility.getFullAXTree')
  const before = await page.evaluate(textSizes)
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%'
  })
  await settledTree(page)
  const after = await page.evaluate(textSizes)
  await page.emulateMedia({ forcedColors: 'active' })
  const problems = [...axProblems(nodes), ...fixedText(before, after, 2), ...hiddenFocus(await page.evaluate(focusOutlines))]
  await page.context().close()
  if (problems.length === 0) {
    console.log(`PASS ${shot.name}`)
    continue
  }
  failed = true
  console.log(`FAIL ${shot.name}\n${problems.map((problem) => `  ${problem}`).join('\n')}`)
}
await browser.close()
if (failed) process.exitCode = 1
