import { chromium } from 'playwright'
import { signInPage, tokenFromPage } from './lib/session.mjs'

/**
 * Reordering invoice lines with mouse, keyboard, the row menu and touch, against a running `protobase dev`
 * (default http://localhost:5173). Reordering only changes the form; Save writes it in one batch. Needs the
 * `:batchWrite` endpoint. Makes a throwaway invoice with four lines and removes it afterwards.
 */
const base = process.env.BASE ?? 'http://localhost:5173'
let token
const api = async (method, path, body, headers = {}) => {
  const response = await fetch(`${base}/api/v1${path}`, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...headers }, body: body && JSON.stringify(body) })
  return { status: response.status, etag: response.headers.get('etag'), body: response.status === 204 ? null : await response.json() }
}
const check = (name, passed) => {
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`)
  if (!passed) process.exitCode = 1
}

const browser = await chromium.launch()
const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await desktop.newPage()
await signInPage(page, base)
token = await tokenFromPage(page, base)
const storageState = await desktop.storageState()

// A throwaway invoice with four lines, removed at the end.
const invoice = (await api('POST', '/invoices', { number: 'ZZ-REORDER-1', companyId: 1, issuedAt: '2026-10-01', dueAt: '2026-10-31' })).body
const lines = []
for (const [index, name] of ['A', 'B', 'C', 'D'].entries()) {
  lines.push((await api('POST', '/invoiceLines', { invoiceId: invoice.id, position: index + 1, description: `Line ${name}`, quantity: 1, unitPrice: '10.00' })).body)
}
const original = lines.map((line) => ({ id: line.id, position: line.position }))
const letters = Object.fromEntries(original.map((line, index) => [line.id, 'ABCD'[index]]))
const lineId = (letter) => original['ABCD'.indexOf(letter)].id

const serverOrder = async () => {
  const page = await api('GET', `/invoiceLines?filter=${encodeURIComponent(`invoiceId = "${invoice.id}"`)}&order_by=position%20asc&page_size=50`)
  return page.body.items.map((line) => letters[line.id]).join('')
}
const screenOrder = (p) => p.locator('[data-line-id]').evaluateAll((rows, map) => rows.map((row) => map[row.getAttribute('data-line-id')]).join(''), letters)
const settled = async (p, expected) => {
  await p.waitForFunction(([want, map]) => [...document.querySelectorAll('[data-line-id]')].map((row) => map[row.getAttribute('data-line-id')]).join('') === want, [expected, letters], { timeout: 10_000 }).catch(() => undefined)
  await p.waitForTimeout(1500)
}
/** Passes when the page and the server both show `expected`; says what they showed otherwise. */
const orderIs = async (name, p, expected) => {
  const [onScreen, onServer] = [await screenOrder(p), await serverOrder()]
  check(`${name} (screen ${onScreen}, server ${onServer}, want ${expected})`, onScreen === expected && onServer === expected)
}
const handle = (p, letter) => p.locator(`[data-line-id="${lineId(letter)}"] [aria-label^="Drag to reorder"]`)
const menuButton = (p, letter) => p.locator(`[data-line-id="${lineId(letter)}"] [aria-label^="Actions for"]`)
const open = async (p) => {
  await p.goto(`${base}/invoices/${invoice.id}`)
  await handle(p, 'A').waitFor()
  await handle(p, 'A').scrollIntoViewIfNeeded()
  await p.locator('[data-line-id]').last().scrollIntoViewIfNeeded()
}
const centre = async (locator) => {
  const box = await locator.boundingBox()
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}
const save = async (p) => {
  await p.getByRole('button', { name: 'Save' }).last().click()
}
const hasUnsaved = async (p) => (await p.getByText('Unsaved changes').count()) > 0

/** Does `reorder`, checks that only the form changed, then Save writes it and a reload shows it. */
const reorderThenSave = async (name, p, reorder, expected, previous) => {
  await reorder()
  await settled(p, expected)
  check(`${name}: the form changes and the server does not (screen ${await screenOrder(p)}, server ${await serverOrder()})`, (await screenOrder(p)) === expected && (await serverOrder()) === previous && (await hasUnsaved(p)))
  await save(p)
  await settled(p, expected)
  await orderIs(`${name}: Save writes the new order`, p, expected)
  await open(p)
  check(`${name}: the order survives a reload`, (await screenOrder(p)) === expected)
}

try {
  await open(page)
  check('the lines start in position order', (await screenOrder(page)) === 'ABCD' && (await serverOrder()) === 'ABCD')

  const from = await centre(handle(page, 'A'))
  const to = await centre(handle(page, 'C'))
  await reorderThenSave('mouse', page, async () => {
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    for (let step = 1; step <= 12; step += 1) await page.mouse.move(from.x, from.y + ((to.y - from.y) * step) / 12 + 8)
    await page.mouse.up()
  }, 'BCAD', 'ABCD')

  await reorderThenSave('keyboard', page, async () => {
    await handle(page, 'D').focus()
    // dnd-kit starts listening for the arrow keys a moment after the pick-up
    for (const key of ['Space', 'ArrowUp', 'ArrowUp']) {
      await page.keyboard.press(key)
      await page.waitForTimeout(150)
    }
    await page.keyboard.press('Space')
    await page.waitForTimeout(150)
    check('keyboard: dnd-kit announces the move to screen readers', (await page.locator('[aria-live]').allTextContents()).join(' ').includes('was dropped at line'))
  }, 'BDCA', 'BCAD')

  await reorderThenSave('menu', page, async () => {
    await menuButton(page, 'B').click()
    await page.getByRole('menuitem', { name: 'Move down' }).click()
  }, 'DBCA', 'BDCA')
  await menuButton(page, 'D').click()
  check('menu: the first line cannot move up', await page.getByRole('menuitem', { name: 'Move up' }).isDisabled())
  await page.keyboard.press('Escape')

  // Discard drops the change; a reload brings it back from this browser; leaving asks first.
  await menuButton(page, 'D').click()
  await page.getByRole('menuitem', { name: 'Move down' }).click()
  await settled(page, 'BDCA')
  await page.getByRole('button', { name: 'Discard' }).last().click()
  await settled(page, 'DBCA')
  await orderIs('discard: the saved order is back and nothing was written', page, 'DBCA')

  await menuButton(page, 'D').click()
  await page.getByRole('menuitem', { name: 'Move down' }).click()
  await settled(page, 'BDCA')
  await page.reload()
  await handle(page, 'A').waitFor()
  check('draft: a reload brings the unsaved order back, with a notice', (await screenOrder(page)) === 'BDCA' && (await page.getByText('Your unsaved changes were restored.').isVisible()))
  check('draft: it is still not saved', (await serverOrder()) === 'DBCA')
  await page.getByRole('link', { name: 'Invoices' }).first().click()
  check('guard: leaving with unsaved changes asks first', await page.getByRole('dialog', { name: 'Leave without saving?' }).isVisible())
  await page.getByRole('button', { name: 'Stay' }).click()
  await page.getByRole('button', { name: 'Discard' }).last().click()
  await settled(page, 'DBCA')

  // touch: the page still scrolls, and a long press on the handle drags
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, storageState })
  const touch = await phone.newPage()
  await open(touch)
  const cdp = await phone.newCDPSession(touch)
  const dispatch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
  const size = await handle(touch, 'A').boundingBox()
  check('touch: the drag handle is at least 44px', size.width >= 43.5 && size.height >= 43.5)
  const scroller = touch.locator('.overflow-y-auto').first()
  await scroller.evaluate((el) => (el.scrollTop = 0))
  await dispatch('touchStart', 200, 600)
  for (let step = 1; step <= 10; step += 1) await dispatch('touchMove', 200, 600 - step * 30)
  await dispatch('touchEnd')
  await touch.waitForTimeout(500)
  check('touch: a swipe outside the handle still scrolls the page', (await scroller.evaluate((el) => el.scrollTop)) > 50)

  await handle(touch, 'A').scrollIntoViewIfNeeded()
  const start = await centre(handle(touch, 'A'))
  const end = await centre(handle(touch, 'D'))
  await reorderThenSave('touch', touch, async () => {
    await dispatch('touchStart', start.x, start.y)
    await touch.waitForTimeout(400)
    for (let step = 1; step <= 14; step += 1) await dispatch('touchMove', start.x, start.y + ((end.y - start.y) * step) / 14 - 6)
    await dispatch('touchEnd')
  }, 'ADBC', 'DBCA')
  await phone.close()
} finally {
  for (const line of lines) await api('DELETE', `/invoiceLines/${line.id}`, undefined, { 'if-match': '*' })
  await api('DELETE', `/invoices/${invoice.id}`, undefined, { 'if-match': '*' })
  await browser.close()
}
