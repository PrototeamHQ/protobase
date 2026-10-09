import { chromium } from 'playwright'
import { apiToken, signInPage } from './lib/session.mjs'

/**
 * Deleting with an outdated version against a running `protobase dev` (default http://localhost:5173).
 * Creates throwaway orders, changes them from a second client, and removes everything it made.
 */
const base = process.env.BASE ?? 'http://localhost:5173'
const token = await apiToken(base)
const api = async (method, path, body, headers = {}) => {
  const response = await fetch(`${base}/api/v1${path}`, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...headers }, body: body && JSON.stringify(body) })
  return { status: response.status, etag: response.headers.get('etag'), body: response.status === 204 ? null : await response.json() }
}
const check = (name, passed) => {
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`)
  if (!passed) process.exitCode = 1
}
const exists = async (id) => (await api('GET', `/orders/${id}`)).status === 200
const createOrder = async (number) => (await api('POST', '/orders', { number, companyId: 1, ownerId: 1, status: 'draft', currencyCode: 'EUR' })).body
const changeFromSecondClient = async (id) => {
  const { etag } = await api('GET', `/orders/${id}`)
  await api('PATCH', `/orders/${id}`, { status: 'confirmed', notes: 'Call the customer first' }, { 'if-match': etag })
}

const created = []
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await signInPage(page, base)
const openRecordThenDelete = async (order) => {
  await page.goto(`${base}/orders/${order.id}`)
  await page.getByRole('button', { name: 'Delete', exact: true }).waitFor()
  await changeFromSecondClient(order.id)
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
  await page.getByRole('dialog', { name: /was changed since you opened it/ }).waitFor()
}

try {
  const first = await createOrder('ZZ-E2E-1')
  created.push(first.id)
  await openRecordThenDelete(first)
  const dialogText = await page.getByRole('dialog').textContent()
  check('412 dialog names the record and the changed fields', dialogText.includes('ZZ-E2E-1') && dialogText.includes('Confirmed') && dialogText.includes('Call the customer first'))
  check('the record still exists while the dialog is open', await exists(first.id))
  await page.getByRole('button', { name: 'Delete anyway' }).click()
  await page.waitForURL(/\/orders$/, { timeout: 10_000 })
  check('the record is gone only after Delete anyway', !(await exists(first.id)))

  const second = await createOrder('ZZ-E2E-2')
  created.push(second.id)
  await openRecordThenDelete(second)
  await page.getByRole('button', { name: 'Review changes' }).click()
  await page.getByRole('dialog').waitFor({ state: 'detached' })
  check('Review changes keeps the record', await exists(second.id))
  const reloaded = await page
    .waitForFunction(() => [...document.querySelectorAll('input')].some((input) => input.value === 'Call the customer first'), null, { timeout: 10_000 })
    .then(() => true, () => false)
  check("Review changes reloads the record with the other client's edit", reloaded)
} finally {
  for (const id of created) if (await exists(id)) await api('DELETE', `/orders/${id}`, undefined, { 'if-match': '*' })
  await browser.close()
}
