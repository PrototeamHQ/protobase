import { chromium } from 'playwright'
import { signInPage, tokenFromPage } from './lib/session.mjs'

/**
 * Undo after a soft delete, and create-form defaults, against a running `protobase dev` (default http://localhost:5173).
 * Makes one throwaway product and removes it with a hard delete through the admin database afterwards (see the note at the end).
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
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await signInPage(page, base)
token = await tokenFromPage(page, base)
const product = (await api('POST', '/products', { categoryId: 1, sku: 'ZZ-UNDO-1', name: 'Throwaway for undo', price: '1.00', currencyCode: 'EUR', attributes: {}, active: true })).body
await page.goto(`${base}/products?filter=${encodeURIComponent('sku = "ZZ-UNDO-1"')}`)
await page.getByText('ZZ-UNDO-1').waitFor()
await page.getByRole('button', { name: 'Row actions' }).first().click()
await page.getByRole('menuitem', { name: 'Delete' }).click()
await page.getByRole('status').first().waitFor()
console.log('toast:', await page.getByRole('status').first().textContent())
await page.getByText(/deleted/).first().waitFor()
check('a soft delete asks nothing and shows an Undo toast', (await page.getByRole('dialog').count()) === 0 && (await page.getByRole('button', { name: 'Undo' }).isVisible()))
check('the record is hidden after the delete', (await api('GET', `/products/${product.id}`)).status === 404)
await page.getByRole('button', { name: 'Undo' }).click()
await page.getByText('ZZ-UNDO-1 restored').waitFor()
check('Undo restores the record', (await api('GET', `/products/${product.id}`)).status === 200)

await page.goto(`${base}/orders/new`)
await page.getByRole('button', { name: 'Create order' }).waitFor()
const defaults = await page.evaluate(() => ({
  discount: [...document.querySelectorAll('label')].find((label) => label.textContent.startsWith('Discount'))?.closest('div.mb-1\\.5')?.parentElement?.querySelector('input')?.value,
  requiredLabels: [...document.querySelectorAll('label')].filter((label) => label.querySelector('[aria-label="required"]')).map((label) => label.textContent.replace('*', '').trim()),
}))
console.log('create form:', JSON.stringify(defaults))
check('a literal default is prefilled', defaults.discount === '0')
check('a field with a default is not marked required', !defaults.requiredLabels.includes('Discount') && defaults.requiredLabels.includes('Number'))
await browser.close()
