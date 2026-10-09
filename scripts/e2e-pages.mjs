import { chromium } from 'playwright'
import { signInPage, tokenFromPage } from './lib/session.mjs'

/**
 * Every composed page of a running `protobase dev` (default http://localhost:5173), for the signed-in user (EMAIL and
 * PASSWORD): what it expects comes from that user's `/meta` and the list API. Each Stat shows the API's count, each
 * Table the API's first page and, when there is one, its second, each RecordCard the API's first match. Fails on
 * console errors and failed requests. Set OUT to a folder to keep screenshots.
 */
const base = process.env.BASE ?? 'http://localhost:5173'
const out = process.env.OUT
const check = (name, passed, detail = '') => {
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}${passed || !detail ? '' : `\n  ${detail}`}`)
  if (!passed) process.exitCode = 1
}

const walk = (node, visit) => {
  visit(node)
  for (const child of node.children) if (typeof child !== 'string') walk(child, visit)
  for (const value of Object.values(node.props)) for (const element of [value].flat()) if (element?.type) walk(element, visit)
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errors = []
page.on('console', (message) => message.type() === 'error' && errors.push(message.text()))
page.on('pageerror', (error) => errors.push(error.message))
page.on('response', (response) => response.status() >= 400 && errors.push(`${response.status()} ${new URL(response.url()).pathname}`))

try {
  await signInPage(page, base)
  const token = await tokenFromPage(page, base)
  const api = async (path) => (await fetch(`${base}/api${path}`, { headers: { authorization: `Bearer ${token}` } })).json()
  const list = (resource, params) => api(`/v1/${resource}?${new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined))}`)
  const meta = await api('/meta')
  check('the user has composed pages', meta.pages.length > 0)
  await page.goto(base)
  await page.waitForURL(`${base}/${meta.pages[0].name}`)
  check('the admin opens on the first page', true)

  for (const entry of meta.pages) {
    await page.goto(`${base}/${entry.name}`)
    await page.getByRole('heading', { name: entry.title, level: 1 }).waitFor()
    check(`${entry.name}: in the sidebar or the user menu`, (await page.getByRole('link', { name: entry.title }).count()) > 0)
    const blocks = []
    walk(entry.tree, (node) => blocks.push(node))

    for (const stat of blocks.filter((node) => node.type === 'Stat' && node.props.resource)) {
      const answer = await list(stat.props.resource, { filter: stat.props.filter, page_size: '1', count: 'exact' })
      const card = page.locator('section').filter({ has: page.getByText(stat.props.label, { exact: true }) }).first()
      const link = card.getByRole('link', { name: String(answer.total_size.toLocaleString('en-IE')), exact: true })
      await link.waitFor()
      check(`${entry.name}: ${stat.props.label} shows the API's count, ${answer.total_size}`, true)
    }

    for (const table of blocks.filter((node) => node.type === 'Table')) {
      const pageSize = String(table.props.pageSize ?? 10)
      const region = page.getByRole('region', { name: table.props.title })
      const view = meta.views.find((candidate) => candidate.resource === table.props.resource)
      const first = (table.props.columns ?? view?.list?.columns)[0]
      const firstColumn = async () => region.locator('tbody tr td:first-child').allTextContents()
      const answer = await list(table.props.resource, { filter: table.props.filter, order_by: table.props.sort, page_size: pageSize })
      await page.waitForFunction(([name, count]) => document.querySelectorAll(`section[aria-label="${name}"] tbody tr`).length === count, [table.props.title, answer.items.length])
      check(`${entry.name}: ${table.props.title} lists the API's first page`, JSON.stringify(await firstColumn()) === JSON.stringify(answer.items.map((row) => String(row[first]))))
      if (!answer.next_page_token) continue
      const next = await list(table.props.resource, { filter: table.props.filter, order_by: table.props.sort, page_size: pageSize, page_token: answer.next_page_token })
      await region.getByRole('button', { name: 'Next page' }).click()
      await region.getByText('Page 2').waitFor()
      await page.waitForFunction(([name, value]) => document.querySelector(`section[aria-label="${name}"] tbody tr td`)?.textContent === value, [table.props.title, String(next.items[0][first])])
      check(`${entry.name}: ${table.props.title} pages to the API's second page`, JSON.stringify(await firstColumn()) === JSON.stringify(next.items.map((row) => String(row[first]))))
    }

    for (const card of blocks.filter((node) => node.type === 'RecordCard' && !node.props.recordKey)) {
      const answer = await list(card.props.resource, { filter: card.props.filter, order_by: card.props.sort, page_size: '1' })
      const region = page.getByRole('region', { name: card.props.title })
      const view = meta.views.find((candidate) => candidate.resource === card.props.resource)
      const record = answer.items[0]
      if (!record) {
        await region.getByText(card.props.empty ?? 'Nothing here yet.').waitFor()
        check(`${entry.name}: ${card.props.title} says nothing matches, like the API`, true)
        continue
      }
      await region.getByText(String(record[view?.title ?? 'id']), { exact: true }).first().waitFor()
      check(`${entry.name}: ${card.props.title} shows the API's first match, ${record[view?.title ?? 'id']}`, true)
    }

    for (const row of blocks.filter((node) => node.type === 'CardRow')) {
      const answer = await list(row.props.resource, { filter: row.props.filter, order_by: row.props.sort, page_size: String(row.props.limit ?? 12) })
      const region = page.getByRole('region', { name: row.props.title })
      await page.waitForFunction(([name, count]) => document.querySelectorAll(`section[aria-label="${name}"] li`).length === count, [row.props.title, answer.items.length])
      check(`${entry.name}: ${row.props.title} has a card per record the API returns (${answer.items.length})`, (await region.getByRole('listitem').count()) === answer.items.length)
    }

    await page.waitForLoadState('networkidle')
    check(`${entry.name}: no custom component is missing`, (await page.getByText(/^No component is registered as/).count()) === 0)
    if (out) await page.screenshot({ path: `${out}/${entry.name}.png`, fullPage: true })
  }
  check('no console errors or failed requests', errors.length === 0, errors.join('\n  '))
} finally {
  await browser.close()
}
