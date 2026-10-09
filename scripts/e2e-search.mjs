import { chromium } from 'playwright'
import { signInPage, tokenFromPage } from './lib/session.mjs'

/**
 * The top bar's global search against a running `protobase dev` (default http://localhost:5173), for the signed-in user
 * (EMAIL and PASSWORD) and QUERY: ⌘K focuses it, its groups list exactly what the list API's `search(...)` gives this
 * user per searchable resource, and Enter opens the first result's record. EXPECT="Organizations:Initech" fails unless
 * that group holds that title, ABSENT the same for a title that must not be found. Fails on console errors.
 */
const base = process.env.BASE ?? 'http://localhost:5173'
const query = process.env.QUERY
if (!query) throw new Error('Set QUERY, the text to search for')
const check = (name, passed, detail = '') => {
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}${passed || !detail ? '' : `\n  ${detail}`}`)
  if (!passed) process.exitCode = 1
}
const pair = (value) => (value ? value.split(':') : undefined)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('console', (message) => message.type() === 'error' && errors.push(message.text()))
page.on('pageerror', (error) => errors.push(error.message))

try {
  await signInPage(page, base)
  const token = await tokenFromPage(page, base)
  const api = async (path) => (await fetch(`${base}/api${path}`, { headers: { authorization: `Bearer ${token}` } })).json()
  const meta = await api('/meta')
  const targets = meta.resources.flatMap((model) => {
    const view = meta.views.find((candidate) => candidate.resource === model.name)
    if (!model.search?.length || !view || view.nav?.hidden || meta.permissions[model.name]?.read === false) return []
    return [{ model, view, label: view.names?.plural ?? model.name }]
  })
  check(`${targets.length} resources can be searched: ${targets.map((target) => target.label).join(', ')}`, targets.length > 0)

  const expected = []
  for (const target of targets) {
    const params = new URLSearchParams({ filter: `search(${JSON.stringify(query)})`, page_size: '5' })
    const answer = await api(`/v1/${target.model.name}?${params}`)
    const text = (name) => target.model.fields[name]?.type === 'text'
    // What names a record in the admin: the view's title, its first text column, a usual name field, any text field.
    const titleField = target.view.title ?? target.view.list?.columns.find(text) ?? ['name', 'title', 'number', 'sku', 'email', 'code', 'description'].find(text) ?? Object.keys(target.model.fields).find(text) ?? target.model.primaryKey[0]
    if (answer.items?.length) expected.push([target.label, answer.items.map((row) => String(row[titleField]))])
  }

  const box = page.getByRole('combobox', { name: 'Global search' })
  await page.keyboard.press('Control+k')
  check('Ctrl+K focuses the search box', await box.evaluate((element) => element === document.activeElement))
  await box.fill(query)
  const list = page.getByRole('listbox', { name: 'Search results' })
  await list.waitFor()
  await page.waitForFunction(() => !document.querySelector('[role=listbox]')?.textContent?.startsWith('Searching'))
  await page.waitForTimeout(400)
  const shown = await list.getByRole('group').evaluateAll((groups) => groups.map((group) => [group.getAttribute('aria-label'), [...group.querySelectorAll('[role=option]')].map((option) => option.textContent)]))
  check(`"${query}" shows what the list API finds for this user`, JSON.stringify(shown) === JSON.stringify(expected), `shown ${JSON.stringify(shown)}, expected ${JSON.stringify(expected)}`)

  const wanted = pair(process.env.EXPECT)
  if (wanted) check(`${wanted[0]} has ${wanted[1]}`, shown.some(([label, titles]) => label === wanted[0] && titles.includes(wanted[1])))
  const unwanted = pair(process.env.ABSENT)
  if (unwanted) check(`${unwanted[0]} does not have ${unwanted[1]}`, !shown.some(([label, titles]) => label === unwanted[0] && titles.includes(unwanted[1])))

  if (shown.length > 0) {
    const [label, [title]] = shown[0]
    const target = targets.find((candidate) => candidate.label === label)
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await page.waitForURL(new RegExp(`/${target.model.name}/[^/]+$`))
    await page.getByRole('heading', { name: title, level: 1 }).waitFor()
    check(`Enter opens ${title}`, true)
  }
  if (process.env.OUT) await page.screenshot({ path: `${process.env.OUT}/search.png` })
  check('no console errors', errors.length === 0, errors.join('\n  '))
} finally {
  await browser.close()
}
