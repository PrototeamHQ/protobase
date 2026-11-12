import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { axProblems, fixedText, hiddenFocus, missingTable, offScreen, outsideBar, tables, textOutsideField } from './a11y-tree/ax-problems.mjs'
import { openStory, settledTree } from './lib/story-layouts.mjs'

/**
 * Checks what a screen reader and a larger text size meet on the main pages in the built Storybook (storybook-static),
 * on desktop and phone: Chromium's accessibility tree has no link or button without a name, one main landmark and no
 * heading that skips a level (a11y-tree/ax-problems.mjs), a chart's table of its numbers on the page with one, all text grows when the root text size doubles, the phone's
 * page and top bar fit its width at 3.3 times the root text size, the largest accessibility size, its open search stays
 * inside the bar at that size, and its text inside the field, with and without a top safe area, and each link and button
 * shows an outline when focused in forced colors.
 */
const root = join(import.meta.dirname, '..')
const storybookDir = join(root, 'storybook-static')
if (!existsSync(join(storybookDir, 'index.json'))) throw new Error('There is no built Storybook in storybook-static; run `bun run build-storybook` first')

const pages = [
  { story: 'guides-bike-shop--step-3', page: 'list with filters' },
  { story: 'list-page-displays--cards', page: 'list with cards' },
  { story: 'guides-bike-shop--step-5', page: 'record with actions' },
  // A chart's numbers reach a screen reader as a table of its periods
  { story: 'record-page-trends-of-related-records--record-trend', page: 'record with a trend', table: ['Period', 'Count'] },
]
const shots = pages.flatMap(({ story, page, table }) => ['desktop', 'phone'].map((viewport) => ({ name: `${page} (${viewport})`, story, viewport, table })))

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

// The page's scrolling width against the width it shows, and the right edge of each shown link and button of the top bar
const widths = () => ({
  width: document.documentElement.clientWidth,
  page: document.documentElement.scrollWidth,
  bar: [...document.querySelectorAll('header:has(> nav) a[href], header:has(> nav) button')].flatMap((element) => {
    if (element.getClientRects().length === 0) return []
    return [{ text: (element.getAttribute('aria-label') || element.textContent.trim()).slice(0, 40), right: Math.round(element.getBoundingClientRect().right) }]
  }),
})

// The top bar's top and bottom, the text, top, bottom and shadow of the field and each button over it while its search is
// open, and the top and bottom of the inside of the field's border and of its text's line, to a tenth of a pixel
const searchBounds = () => {
  const tenth = (value) => Math.round(value * 10) / 10
  const header = document.querySelector('header:has(> nav)')
  const bar = header.getBoundingClientRect()
  const input = [...header.querySelectorAll('[role="combobox"]')].find((element) => element.getClientRects().length > 0)
  const field = input.parentElement.getBoundingClientRect()
  const border = getComputedStyle(input.parentElement)
  const line = input.getBoundingClientRect()
  const controls = [[input.parentElement, 'Search field'], ...[...input.closest('.absolute').querySelectorAll('button')].map((button) => [button, button.getAttribute('aria-label')])]
  return {
    bar: { top: tenth(bar.top), bottom: tenth(bar.bottom) },
    field: { top: tenth(field.top + Number.parseFloat(border.borderTopWidth)), bottom: tenth(field.bottom - Number.parseFloat(border.borderBottomWidth)) },
    line: { top: tenth(line.top), bottom: tenth(line.bottom) },
    controls: controls.map(([element, text]) => {
      const box = element.getBoundingClientRect()
      return { text, top: tenth(box.top), bottom: tenth(box.bottom), boxShadow: getComputedStyle(element).boxShadow }
    }),
  }
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
  const fits = []
  if (shot.viewport === 'phone') {
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '330%'
    })
    await settledTree(page)
    fits.push(...offScreen(await page.evaluate(widths)))
    await page.getByRole('button', { name: 'Search', exact: true }).click()
    for (const safeTop of ['0px', '47px']) {
      await page.evaluate((safeTop) => document.documentElement.style.setProperty('--safe-area-inset-top', safeTop), safeTop)
      await settledTree(page)
      const bounds = await page.evaluate(searchBounds)
      fits.push(...[...outsideBar(bounds), ...textOutsideField(bounds)].map((problem) => `${problem}, with a ${safeTop} safe area`))
    }
    await page.getByRole('button', { name: 'Close search' }).click()
    await page.evaluate(() => document.documentElement.style.removeProperty('--safe-area-inset-top'))
  }
  await page.emulateMedia({ forcedColors: 'active' })
  const problems = [...axProblems(nodes), ...(shot.table ? missingTable(tables(nodes), shot.table) : []), ...fixedText(before, after, 2), ...fits, ...hiddenFocus(await page.evaluate(focusOutlines))]
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
