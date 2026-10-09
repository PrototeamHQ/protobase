import { chromium } from 'playwright'
import { signInPage, tokenFromPage } from './lib/session.mjs'

/**
 * The sidebar's recent-record groups and the user menu against a running `protobase dev` of the ERP example
 * (default http://localhost:5173). Works for any role: what it expects comes from `/meta` and the list API as that
 * user sees them. Set OUT to a folder to keep screenshots.
 *
 * Fails on console errors and failed API requests, except one kind it provokes itself: when the list API refuses this
 * user a resource (a role whose `.own` filter cannot match a Better Auth user id), the group must say so, and that
 * resource's requests may fail with that same status. Any 5xx fails the run.
 */
const base = process.env.BASE ?? 'http://localhost:5173'
const out = process.env.OUT
const check = (name, passed, detail = '') => {
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}${passed || !detail ? '' : `\n  ${detail}`}`)
  if (!passed) process.exitCode = 1
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
const failed = []
// The browser logs every failed request as a console error without its URL; those are checked through `failed` instead.
const networkError = /^Failed to load resource: the server responded with a status of (\d+)/
page.on('console', (message) => message.type() === 'error' && errors.push(message.text()))
page.on('pageerror', (error) => errors.push(error.message))
page.on('response', (response) => response.status() >= 400 && failed.push({ status: response.status(), path: new URL(response.url()).pathname }))
// Resources whose list API refuses this user, with the status it answered.
const refused = new Map()
const shot = (name) => (out ? page.screenshot({ path: `${out}/${name}.png` }) : undefined)

try {
  await signInPage(page, base)
  const token = await tokenFromPage(page, base)
  const api = async (path) => (await fetch(`${base}/api${path}`, { headers: { authorization: `Bearer ${token}` } })).json()
  const meta = await api('/meta')
  const sidebar = page.getByRole('navigation', { name: 'Resources' })

  // Each recent group lists what the list API returns to this user for the same filter, order and size.
  const grouped = meta.views.filter((view) => view.nav?.recent && !view.nav.hidden)
  check('the ERP has recent groups for this user', grouped.length > 0)
  for (const view of grouped) {
    const recent = view.nav.recent
    const name = `Recent ${view.names.plural.toLowerCase()}`
    const list = sidebar.getByRole('list', { name })
    await list.getByRole('link', { name: 'View all' }).waitFor()
    await page.waitForFunction((label) => !document.querySelector(`ul[aria-label="${label}"]`)?.textContent?.includes('Loading'), name)
    const query = new URLSearchParams({ page_size: String(recent.limit ?? 3), ...(recent.filter && { filter: recent.filter }), ...(recent.orderBy && { order_by: recent.orderBy }) })
    const answer = await api(`/v1/${view.resource}?${query}`)
    if (!answer.items) {
      refused.set(view.resource, answer.status)
      check(`${name}: says it could not load when the list API refuses (${answer.status})`, (await list.textContent()).includes('Could not load'))
      continue
    }
    const rows = answer.items
    const expected = rows.map((row) => `${row[view.title]}, ${row[recent.status]}`)
    const shown = await list.getByRole('link').evaluateAll((links) => links.map((link) => link.getAttribute('aria-label') ?? link.textContent))
    check(`${name}: the list API's records, then View all`, JSON.stringify(shown) === JSON.stringify([...expected, 'View all']), `shown ${JSON.stringify(shown)}, expected ${JSON.stringify(expected)}`)
    const dots = await list.locator('[data-tone]').evaluateAll((spans) => spans.map((span) => `${span.dataset.tone}${span.dataset.pulse ? '+pulse' : ''}`))
    const tones = rows.map((row) => `${recent.tones[row[recent.status]] ?? 'neutral'}${recent.pulse?.includes(row[recent.status]) ? '+pulse' : ''}`)
    check(`${name}: every record has its status dot`, JSON.stringify(dots) === JSON.stringify(tones), `dots ${JSON.stringify(dots)}, expected ${JSON.stringify(tones)}`)
  }
  await shot('sidebar-groups')

  const orders = grouped.find((view) => view.resource === 'orders')
  if (orders) {
    const list = sidebar.getByRole('list', { name: 'Recent orders' })
    const first = list.getByRole('link').first()
    const label = await first.getAttribute('aria-label')
    if (label) {
      await first.click()
      await page.waitForURL(/\/orders\/[^/]+$/)
      check('a record in the group opens that record', true)
      const current = await list.locator(`a[aria-current="page"][aria-label="${label}"]`).waitFor({ timeout: 5_000 }).then(() => true, () => false)
      check('the open record is marked current in the group', current)
      await shot('record-open')
    }
    await list.getByRole('link', { name: 'View all' }).click()
    await page.waitForURL(/\/orders$/)
    check('View all opens the list', true)
    await page.goto(`${base}/products`)
    await sidebar.getByRole('link', { name: 'Orders', exact: true }).click()
    await page.waitForURL(/\/orders$/)
    check('the entry label opens the list', true)

    const toggle = sidebar.getByRole('button', { name: 'Recent orders' })
    await toggle.click()
    check('the chevron hides the records', (await toggle.getAttribute('aria-expanded')) === 'false' && (await list.count()) === 0)
    await page.reload()
    await sidebar.getByRole('button', { name: 'Recent orders' }).waitFor()
    check('a closed group stays closed after a reload', (await sidebar.getByRole('button', { name: 'Recent orders' }).getAttribute('aria-expanded')) === 'false')
    await sidebar.getByRole('button', { name: 'Recent orders' }).click()
    check('the chevron shows them again', (await list.count()) === 1)
  }

  // The user menu holds the items /meta gives this user, in order, then Sign out; its resources are not in the sidebar.
  const items = meta.userMenu?.items ?? []
  const labelOf = (item) => (item.kind === 'link' ? item.label : (item.label ?? meta.views.find((view) => view.resource === item.resource)?.names?.plural ?? item.resource))
  await page.getByRole('button', { name: 'Profile menu' }).click()
  const menu = page.getByRole('menu')
  const entries = await menu.getByRole('menuitem').allTextContents()
  check('the user menu lists the configured pages, then Sign out', JSON.stringify(entries) === JSON.stringify([...items.map(labelOf), 'Sign out']), `menu ${JSON.stringify(entries)}`)
  await shot('user-menu')
  for (const item of items.filter((entry) => entry.kind === 'link')) {
    const link = menu.getByRole('menuitem', { name: item.label })
    check(`${item.label} opens ${item.href} in a new tab`, (await link.getAttribute('href')) === item.href && (await link.getAttribute('target')) === '_blank')
  }
  for (const item of items.filter((entry) => entry.kind === 'resource')) {
    check(`${labelOf(item)} is not in the sidebar`, (await sidebar.locator(`a[href$="/${item.resource}"]:not([role="menuitem"])`).count()) === 0)
  }
  const firstPage = items.find((entry) => entry.kind === 'resource')
  if (firstPage) {
    await menu.getByRole('menuitem', { name: labelOf(firstPage) }).click()
    await page.waitForURL(new RegExp(`/${firstPage.resource}$`))
    check(`${labelOf(firstPage)} opens its list and closes the menu`, (await page.getByRole('menu').count()) === 0)
    await page.getByRole('button', { name: 'Profile menu' }).click()
    check(`${labelOf(firstPage)} is marked current in the menu`, (await page.getByRole('menuitem', { name: labelOf(firstPage) }).getAttribute('aria-current')) === 'page')
    await page.keyboard.press('Escape')
  }

  // `/api/v1/orders`, `/api/v1/orders:facets`, `/api/v1/orders/<key>` all belong to `orders`.
  const resourceOf = (path) => path.match(/^\/api\/v1\/([^/:]+)/)?.[1]
  const expected = (request) => request.status < 500 && refused.get(resourceOf(request.path)) === request.status
  const unexpected = failed.filter((request) => !expected(request))
  check('no unexpected failed requests', unexpected.length === 0, unexpected.map((request) => `${request.status} ${request.path}`).join('\n  '))
  if (refused.size > 0) check(`only refused resources failed (${[...refused].map(([resource, status]) => `${resource} ${status}`).join(', ')})`, failed.length > 0 && unexpected.length === 0)
  const statuses = new Set(failed.map((request) => String(request.status)))
  const consoleErrors = errors.filter((text) => !statuses.has(text.match(networkError)?.[1]))
  check('no console errors besides those failed requests', consoleErrors.length === 0, consoleErrors.join('\n  '))
} finally {
  await browser.close()
}
