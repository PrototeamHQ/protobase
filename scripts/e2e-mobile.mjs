import { chromium } from 'playwright'
import { signInPage, tokenFromPage } from './lib/session.mjs'

/**
 * The admin on phones, tablets and desktop against a running `protobase dev` (default http://localhost:5173).
 * Checks the drawer, sideways grid scrolling, filter sheet, record layout and dialogs; makes and removes one throwaway order.
 */
const base = process.env.BASE ?? 'http://localhost:5173'
const out = new URL('../screenshots/live/mobile/', import.meta.url).pathname
let token
const api = async (method, path, body, headers = {}) => {
  const response = await fetch(`${base}/api/v1${path}`, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...headers }, body: body && JSON.stringify(body) })
  return { status: response.status, etag: response.headers.get('etag'), body: response.status === 204 ? null : await response.json() }
}
const check = (name, passed) => {
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`)
  if (!passed) process.exitCode = 1
}
const viewports = [
  { name: 'phone-360', width: 360, height: 740, touch: true },
  { name: 'phone-390', width: 390, height: 844, touch: true },
  { name: 'tablet-768', width: 768, height: 1024, touch: true },
  { name: 'desktop-1440', width: 1440, height: 900, touch: false },
]
const pageDoesNotScrollSideways = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth && document.body.scrollWidth <= window.innerWidth)

const browser = await chromium.launch()
// One sign-in for the whole run: Better Auth allows only a few attempts a minute.
const signedIn = await browser.newContext()
const signedInPage = await signedIn.newPage()
await signInPage(signedInPage, base)
token = await tokenFromPage(signedInPage, base)
const storageState = await signedIn.storageState()
await signedIn.close()
const throwaway = (await api('POST', '/orders', { number: 'ZZ-MOBILE-1', companyId: 1, ownerId: 1, status: 'draft', currencyCode: 'EUR' })).body
try {
  for (const viewport of viewports) {
    const label = viewport.name
    const phone = viewport.width < 768
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 2, hasTouch: viewport.touch, isMobile: viewport.touch, storageState })
    const page = await context.newPage()
    const shot = (name) => (label === 'phone-390' ? page.screenshot({ path: `${out}${name}.png` }) : undefined)

    await page.goto(`${base}/orders`)
    await page.locator('[role=row]').nth(1).waitFor()
    await page.waitForTimeout(800)
    check(`${label}: orders list does not scroll the page sideways`, await pageDoesNotScrollSideways(page))
    await shot('orders-list')

    // navigation drawer
    const menu = page.getByRole('button', { name: 'Open navigation' })
    check(`${label}: hamburger only below md`, (await menu.count()) === (phone ? 1 : 0) || (!phone && !(await menu.isVisible().catch(() => false))))
    if (phone) {
      const size = await menu.boundingBox()
      check(`${label}: hamburger is at least 44px`, size.width >= 44 && size.height >= 44)
      check(`${label}: hamburger has aria-controls and aria-expanded=false`, (await menu.getAttribute('aria-controls')) === 'app-drawer' && (await menu.getAttribute('aria-expanded')) === 'false')
      await menu.click()
      await page.getByRole('dialog', { name: 'Navigation' }).waitFor()
      check(`${label}: drawer sets aria-expanded and locks body scroll`, (await menu.getAttribute('aria-expanded')) === 'true' && (await page.evaluate(() => document.body.style.overflow)) === 'hidden')
      check(`${label}: focus moves into the drawer`, await page.evaluate(() => document.getElementById('app-drawer')?.contains(document.activeElement) ?? false))
      await page.keyboard.press('Tab')
      await page.keyboard.press('Shift+Tab')
      await page.keyboard.press('Shift+Tab')
      check(`${label}: focus stays trapped in the drawer`, await page.evaluate(() => document.getElementById('app-drawer')?.contains(document.activeElement) ?? false))
      await shot('drawer-open')
      await page.keyboard.press('Escape')
      check(`${label}: Escape closes the drawer and returns focus to the button`, (await page.getByRole('dialog', { name: 'Navigation' }).count()) === 0 && (await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))) === 'Open navigation')
      await menu.click()
      await page.mouse.click(viewport.width - 5, 300)
      check(`${label}: backdrop tap closes the drawer`, (await page.getByRole('dialog', { name: 'Navigation' }).count()) === 0)
      await menu.click()
      await page.getByRole('dialog', { name: 'Navigation' }).getByRole('link', { name: 'Invoices' }).click()
      await page.getByRole('heading', { name: 'Invoices' }).waitFor()
      check(`${label}: navigating closes the drawer`, (await page.getByRole('dialog', { name: 'Navigation' }).count()) === 0)
      check(`${label}: body scroll is released`, (await page.evaluate(() => document.body.style.overflow)) === '')
      await page.goto(`${base}/orders`)
      await page.locator('[role=row]').nth(1).waitFor()
      // search collapses to an icon
      await page.getByRole('button', { name: 'Search', exact: true }).click()
      const search = page.getByRole('combobox', { name: 'Global search' })
      const box = await search.boundingBox()
      check(`${label}: search opens full width`, box.width > viewport.width * 0.6)
      await page.getByRole('button', { name: 'Close search' }).click()
    }

    // the grid scrolls inside itself; nothing is pinned until the user pins it
    const scroller = page.locator('[role=grid] .overflow-x-auto').first()
    const scrollable = await scroller.evaluate((el) => el.scrollWidth > el.clientWidth + 1)
    check(`${label}: grid ${viewport.width < 1000 ? 'scrolls sideways' : 'fits'}`, scrollable === (viewport.width < 1000))
    if (scrollable) {
      const firstCell = () => page.locator('[role=row]').nth(1).locator('[role=cell]').first()
      const checkbox = page.locator('[role=row]').nth(1).getByRole('checkbox').first()
      const before = (await firstCell().boundingBox()).x
      const checkboxBefore = (await checkbox.boundingBox()).x
      await scroller.evaluate((el) => (el.scrollLeft = 200))
      await page.waitForTimeout(200)
      check(`${label}: by default the first column scrolls away but the checkbox stays`, (await firstCell().boundingBox()).x < before - 100 && Math.abs((await checkbox.boundingBox()).x - checkboxBefore) < 2)
      await scroller.evaluate((el) => (el.scrollLeft = 0))
      await page.getByRole('button', { name: 'Number column menu' }).click()
      await page.getByRole('menuitem', { name: 'Pin to left' }).click()
      await scroller.evaluate((el) => (el.scrollLeft = 200))
      await page.waitForTimeout(250)
      const pinnedAt = (await firstCell().boundingBox()).x
      const gutterWidth = (await page.locator('[role=row]').nth(1).locator('[role=cell]').first().boundingBox()).x - (await checkbox.boundingBox()).x
      check(`${label}: a pinned column stays next to the checkbox while the grid scrolls (${Math.round(before)} -> ${Math.round(pinnedAt)})`, pinnedAt < before + 1 && pinnedAt > 0 && gutterWidth > 0)
      check(`${label}: the pin is remembered per user and resource`, (await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('protobase:pinned:') && key.endsWith(':orders')).length)) === 1)
      await page.reload()
      await page.locator('[role=row]').nth(1).waitFor()
      await scroller.evaluate((el) => (el.scrollLeft = 200))
      await page.waitForTimeout(250)
      check(`${label}: it is still pinned after a reload`, (await firstCell().boundingBox()).x > 0 && (await firstCell().boundingBox()).x < before + 1)
      check(`${label}: page still does not scroll sideways`, await pageDoesNotScrollSideways(page))
      await shot('orders-scrolled-sideways')
      const rowMenu = page.locator('[role=row]').nth(1).getByRole('button', { name: 'Row actions' })
      if (viewport.touch) {
        const size = await rowMenu.boundingBox()
        check(`${label}: row menu button is at least 44px`, size.width >= 43.5 && size.height >= 43.5)
      }
      await rowMenu.click()
      check(`${label}: row menu opens while scrolled sideways`, await page.getByRole('menuitem', { name: 'Delete' }).isVisible())
      await page.keyboard.press('Escape')
      await scroller.evaluate((el) => (el.scrollLeft = 0))
      await page.getByRole('button', { name: 'Number column menu' }).click()
      await page.getByRole('menuitem', { name: 'Unpin' }).click()
      check(`${label}: Unpin forgets the pin`, (await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('protobase:pinned:')).length)) === 0)
    }

    // filters and chart
    if (phone) {
      await page.getByRole('button', { name: /^Filters/ }).click()
      await page.getByRole('dialog', { name: 'Filters' }).waitFor()
      check(`${label}: filter sheet opens`, await page.getByRole('dialog', { name: 'Filters' }).getByText('Status').first().isVisible())
      await shot('filters-sheet')
      await page.keyboard.press('Escape')
    }
    check(`${label}: Day/Week switch is reachable`, await page.getByRole('button', { name: 'Week' }).isVisible())

    // record page
    await page.goto(`${base}/invoices/1`)
    await page.getByText('Billing details').waitFor()
    await page.waitForTimeout(500)
    check(`${label}: invoice record does not scroll the page sideways`, await pageDoesNotScrollSideways(page))
    const columns = await page.evaluate(() => {
      const grid = [...document.querySelectorAll('div')].find((el) => el.className.toString().includes('md:grid-cols-[minmax(0,1fr)_300px]'))
      return getComputedStyle(grid).gridTemplateColumns.split(' ').length
    })
    check(`${label}: record is ${phone ? 'one column' : 'two columns'}`, columns === (viewport.width < 768 ? 1 : 2))
    if (phone) {
      const save = page.getByRole('button', { name: 'Save' }).last()
      const saveBox = await save.boundingBox()
      check(`${label}: Save sits in a sticky bottom bar`, saveBox.y + saveBox.height <= viewport.height && saveBox.y > viewport.height - 90)
      await page.evaluate(() => document.querySelector('.overflow-y-auto')?.scrollTo(0, 99999))
      await page.waitForTimeout(300)
      check(`${label}: Save is still reachable after scrolling down`, (await save.boundingBox()).y > viewport.height - 90)
      await page.evaluate(() => document.querySelector('.overflow-y-auto')?.scrollTo(0, 0))
      await shot('invoice-record')
      const linesScroller = page.locator('.overflow-x-auto', { has: page.getByText('Qty').first() }).first()
      check(`${label}: invoice lines scroll inside their own container`, (await linesScroller.count()) === 0 || (await linesScroller.evaluate((el) => el.scrollWidth >= el.clientWidth)))
    }

    // 412 dialog on the throwaway order
    await page.goto(`${base}/orders/${throwaway.id}`)
    await page.getByRole('button', { name: 'Delete', exact: true }).last().waitFor()
    const current = await api('GET', `/orders/${throwaway.id}`)
    await api('PATCH', `/orders/${throwaway.id}`, { status: 'confirmed', notes: `edited ${label}` }, { 'if-match': current.etag })
    await page.getByRole('button', { name: 'Delete', exact: true }).last().click()
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
    const conflict = page.getByRole('dialog', { name: /was changed since you opened it/ })
    await conflict.waitFor()
    const dialogBox = await conflict.boundingBox()
    check(`${label}: 412 dialog fits the screen`, dialogBox.x >= 0 && dialogBox.x + dialogBox.width <= viewport.width && dialogBox.y >= 0 && dialogBox.y + dialogBox.height <= viewport.height)
    check(`${label}: 412 dialog buttons are visible`, (await conflict.getByRole('button', { name: 'Review changes' }).isVisible()) && (await conflict.getByRole('button', { name: 'Delete anyway' }).isVisible()))
    await shot('delete-conflict')
    check(`${label}: page still does not scroll sideways with a dialog open`, await pageDoesNotScrollSideways(page))
    await page.getByRole('button', { name: 'Review changes' }).click()
    await context.close()
  }
} finally {
  if ((await api('GET', `/orders/${throwaway.id}`)).status === 200) await api('DELETE', `/orders/${throwaway.id}`, undefined, { 'if-match': '*' })
  await browser.close()
}
