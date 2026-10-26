import { expect } from 'vitest'

/** The session cookie of an app on `http://localhost:5173`, whose cookie names carry its port. */
export const sessionCookie = 'better-auth-5173.session_token'

/** The session token a response sets in its session cookie, whose value is `token.signature`. */
export const sessionTokenOf = (response: Response) => {
  const line = response.headers.getSetCookie().find((set) => set.startsWith(`${sessionCookie}=`) && !set.startsWith(`${sessionCookie}=;`))
  expect(line, 'the session cookie').toBeDefined()
  return decodeURIComponent(line!.slice(sessionCookie.length + 1).split(';')[0]!).split('.')[0]!
}

/**
 * Expects `response` to set the session cookie, httpOnly, and to hand page script no session token: neither its value,
 * under any key, nor a `token` key in the body, nor the value in any other header. Answers the token.
 */
export const expectNoSessionToken = async (response: Response) => {
  const token = sessionTokenOf(response)
  for (const line of response.headers.getSetCookie().filter((set) => set.includes(token))) expect(line).toMatch(/;\s*HttpOnly/i)
  const body = await response.clone().text()
  expect(body).not.toContain(token)
  expect(body).not.toContain('"token"')
  for (const [name, value] of response.headers) if (name !== 'set-cookie') expect(value, name).not.toContain(token)
  return token
}

/** Expects no session token among `tokens` in the body or the headers of `response`, besides Set-Cookie. */
export const expectNoneOf = async (response: Response, tokens: string[]) => {
  const body = await response.clone().text()
  for (const token of tokens) {
    expect(body).not.toContain(token)
    for (const [name, value] of response.headers) if (name !== 'set-cookie') expect(value, name).not.toContain(token)
  }
}
