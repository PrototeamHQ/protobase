import { chromium } from 'playwright'
import { signInPage, tokenFromPage } from './lib/session.mjs'

/**
 * A field the signed-in user may not read (default: `stockMoves.unitCost`, hidden from the `warehouse` role) must appear
 * nowhere in the UI. Sign in as such a user (EMAIL, PASSWORD) against a running `protobase dev` (default http://localhost:5173).
 */
const base = process.env.BASE ?? 'http://localhost:5173'
const resource = process.env.RESOURCE ?? 'stockMoves'
const field = process.env.FIELD ?? 'unitCost'
const label = process.env.LABEL ?? 'Unit cost'
const check = (name, passed) => {
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`)
  if (!passed) process.exitCode = 1
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await signInPage(page, base)
const token = await tokenFromPage(page, base)
const authorization = { authorization: `Bearer ${token}` }
const bodyText = () => page.locator('body').innerText()
const mentions = async () => (await bodyText()).toLowerCase().includes(label.toLowerCase())

try {
  const meta = await (await fetch(`${base}/api/meta`, { headers: authorization })).text()
  check('/meta never names the field', !meta.includes(field))

  const list = await (await fetch(`${base}/api/v1/${resource}?page_size=1`, { headers: authorization })).json()
  check('a list row has no value for it', !(field in list.items[0]))
  const id = list.items[0].id

  await page.goto(`${base}/${resource}`)
  await page.getByRole('row').nth(1).waitFor()
  check('the list has no column for it', !(await mentions()))

  const searches = []
  page.on('request', (request) => searches.push(request.url()))
  await page.getByRole('button', { name: /filter|columns/i }).first().click().catch(() => {})
  check('filter and column menus do not offer it', !(await mentions()))

  await page.goto(`${base}/${resource}/${id}`)
  await page.getByRole('main').first().waitFor()
  await page.waitForTimeout(1000)
  check('the record page does not show it', !(await mentions()))
  check('no request asked for it', !searches.some((url) => url.includes(field)))
  const html = await page.content()
  check('the page source never holds the field name as text', !html.includes(`>${label}<`))
} finally {
  await browser.close()
}
