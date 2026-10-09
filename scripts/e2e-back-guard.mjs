import { chromium } from 'playwright'
import { signInPage, tokenFromPage } from './lib/session.mjs'

/**
 * The browser back button with unsaved changes, against a running `protobase dev` (default http://localhost:5173).
 * Makes a throwaway invoice with two lines, reorders them without saving, and removes everything afterwards.
 */
const base = process.env.BASE ?? 'http://localhost:5173'
let token
const api = async (method, path, body, headers = {}) => {
  const response = await fetch(`${base}/api/v1${path}`, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...headers }, body: body && JSON.stringify(body) })
  return { status: response.status, body: response.status === 204 ? null : await response.json() }
}
const check = (name, passed) => {
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`)
  if (!passed) process.exitCode = 1
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await signInPage(page, base)
token = await tokenFromPage(page, base)
const invoice = (await api('POST', '/invoices', { number: 'ZZ-BACK-1', companyId: 1, issuedAt: '2026-10-01', dueAt: '2026-10-31' })).body
const lines = []
for (const [index, name] of ['A', 'B'].entries()) lines.push((await api('POST', '/invoiceLines', { invoiceId: invoice.id, position: index + 1, description: `Line ${name}`, quantity: 1, unitPrice: '10.00' })).body)

try {
  await page.goto(`${base}/invoices?filter=${encodeURIComponent('number = "ZZ-BACK-1"')}`)
  await page.getByText('ZZ-BACK-1').first().click()
  await page.waitForURL(new RegExp(`/invoices/${invoice.id}$`))
  await page.getByRole('button', { name: 'Actions for Line A' }).waitFor()
  const here = page.url()

  check('going back with nothing unsaved just goes back', await (async () => {
    await page.goBack()
    await page.waitForURL(/\/invoices\?/)
    await page.goForward()
    await page.waitForURL(new RegExp(`/invoices/${invoice.id}$`))
    return !(await page.getByRole('dialog', { name: 'Leave without saving?' }).count())
  })())

  await page.getByRole('button', { name: 'Actions for Line A' }).click()
  await page.getByRole('menuitem', { name: 'Move down' }).click()
  await page.getByText('Unsaved changes').first().waitFor()

  await page.goBack()
  await page.getByRole('dialog', { name: 'Leave without saving?' }).waitFor()
  check('back with unsaved changes asks first, and stays on the record', page.url() === here)
  await page.getByRole('button', { name: 'Stay' }).click()
  check('Stay keeps the unsaved order', (await page.getByText('Unsaved changes').count()) > 0 && page.url() === here)

  await page.goBack()
  await page.getByRole('dialog', { name: 'Leave without saving?' }).waitFor()
  await page.getByRole('button', { name: 'Leave' }).click()
  await page.waitForURL(/\/invoices\?/)
  check('Leave goes back to the list', true)

  await page.goForward()
  await page.waitForURL(new RegExp(`/invoices/${invoice.id}$`))
  check('forward again shows the unsaved order restored from this browser', await page.getByText('Your unsaved changes were restored.').isVisible())
  await page.getByRole('button', { name: 'Discard' }).last().click()
} finally {
  for (const line of lines) await api('DELETE', `/invoiceLines/${line.id}`, undefined, { 'if-match': '*' })
  await api('DELETE', `/invoices/${invoice.id}`, undefined, { 'if-match': '*' })
  await browser.close()
}
