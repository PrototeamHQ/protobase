import { chromium } from 'playwright'

/**
 * The sign-in flow against a running `protobase dev` (default http://localhost:5173).
 * Needs an existing user: EMAIL=you@example.com PASSWORD=... bun scripts/e2e-login.mjs
 */
const base = process.env.BASE ?? 'http://localhost:5173'
const { EMAIL, PASSWORD } = process.env
if (!EMAIL || !PASSWORD) throw new Error('Set EMAIL and PASSWORD of an existing user')
const check = (name, passed) => {
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`)
  if (!passed) process.exitCode = 1
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
try {
  await page.goto(base)
  await page.getByRole('heading', { name: 'Sign in to Protobase' }).waitFor()
  check('a signed-out visitor sees the sign-in page', true)

  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Password').fill(`${PASSWORD}-wrong`)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByRole('alert').waitFor()
  check('a wrong password shows an error', (await page.getByRole('alert').textContent()).length > 0)

  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByRole('button', { name: 'Profile menu' }).waitFor()
  check('signing in opens the admin', true)

  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }))
  check('no token is kept in storage', !/eyJ[\w-]+\.[\w-]+\./.test(stored))

  await page.getByRole('button', { name: 'Profile menu' }).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await page.getByRole('heading', { name: 'Sign in to Protobase' }).waitFor()
  check('signing out returns to the sign-in page', true)

  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByRole('button', { name: 'Profile menu' }).waitFor()
  await page.context().clearCookies()
  await page.reload()
  await page.getByRole('heading', { name: 'Sign in to Protobase' }).waitFor()
  check('without a session cookie the app asks to sign in again', true)
} finally {
  await browser.close()
}
