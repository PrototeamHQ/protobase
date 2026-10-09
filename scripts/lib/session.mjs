/** Signing in for the Playwright scripts: EMAIL and PASSWORD name an existing user (`protobase users create`). */
export const credentials = () => {
  const { EMAIL, PASSWORD } = process.env
  if (!EMAIL || !PASSWORD) throw new Error('Set EMAIL and PASSWORD of an existing user, for example one made with `protobase users create`')
  return { email: EMAIL, password: PASSWORD }
}

/** A bearer token for API calls from the script itself: sign in, then ask Better Auth for the JWT with the session cookie. */
export const apiToken = async (base) => {
  const { email, password } = credentials()
  const signIn = await fetch(`${base}/api/auth/sign-in/email`, { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: JSON.stringify({ email, password }) })
  if (!signIn.ok) throw new Error(`Sign-in failed: ${signIn.status}`)
  const cookie = signIn.headers.getSetCookie().map((entry) => entry.split(';')[0]).join('; ')
  const token = await fetch(`${base}/api/auth/token`, { headers: { cookie } })
  return (await token.json()).token
}

/** Signs in through the form, so the page has a session. */
export const signInPage = async (page, base) => {
  const { email, password } = credentials()
  await page.goto(base)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByRole('button', { name: 'Profile menu' }).waitFor()
}

/** A bearer token for a page that is already signed in, reusing its session cookie (one sign-in instead of two). */
export const tokenFromPage = async (page, base) => {
  const cookie = (await page.context().cookies(base)).map((entry) => `${entry.name}=${entry.value}`).join('; ')
  return (await (await fetch(`${base}/api/auth/token`, { headers: { cookie } })).json()).token
}
