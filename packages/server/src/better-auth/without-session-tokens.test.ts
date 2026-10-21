import { describe, expect, it } from 'vitest'
import { withoutSessionTokens } from './without-session-tokens'

const answer = (body: unknown, init: { status?: number; contentType?: string } = {}) => {
  const headers = new Headers({ 'content-type': init.contentType ?? 'application/json' })
  headers.append('set-cookie', 'better-auth.session_token=abc.sig; HttpOnly')
  headers.append('set-cookie', 'better-auth.session_data=x; HttpOnly')
  return new Response(JSON.stringify(body), { status: init.status ?? 200, headers })
}
const at = (path: string) => new Request(`https://app.test/api/auth${path}`)
const stripped = async (path: string, response: Response) => (await withoutSessionTokens(at(path), response)).json()

describe('withoutSessionTokens', () => {
  it("drops get-session's session token and keeps the cookies", async () => {
    const response = await withoutSessionTokens(at('/get-session'), answer({ session: { id: 's', token: 'abc', expiresAt: 'x' }, user: { id: 'u' } }))
    expect(await response.json()).toEqual({ session: { id: 's', expiresAt: 'x' }, user: { id: 'u' } })
    expect(response.headers.getSetCookie()).toEqual(['better-auth.session_token=abc.sig; HttpOnly', 'better-auth.session_data=x; HttpOnly'])
  })

  it("drops a sign-in's token and every listed session's", async () => {
    expect(await stripped('/sign-in/email', answer({ redirect: false, token: 'abc', user: { id: 'u' } }))).toEqual({ redirect: false, user: { id: 'u' } })
    expect(await stripped('/list-sessions', answer([{ id: 'a', token: 'one' }, { id: 'b', token: 'two' }]))).toEqual([{ id: 'a' }, { id: 'b' }])
  })

  it("drops the nested tokens of an admin's session list and a passkey sign-in", async () => {
    expect(await stripped('/admin/list-user-sessions', answer({ sessions: [{ id: 'a', token: 'one' }] }))).toEqual({ sessions: [{ id: 'a' }] })
    expect(await stripped('/passkey/verify-authentication', answer({ session: { id: 's', token: 'abc' }, user: { id: 'u' } }))).toEqual({ session: { id: 's' }, user: { id: 'u' } })
  })

  it("keeps the JWT plugin's API token, and answers that are not JSON", async () => {
    expect(await stripped('/token', answer({ token: 'jwt' }))).toEqual({ token: 'jwt' })
    const page = new Response('<p>token</p>', { headers: { 'content-type': 'text/html' } })
    expect(await withoutSessionTokens(at('/error'), page)).toBe(page)
  })

  it('keeps the exemption to the exact path of the API token', async () => {
    const session = { session: { id: 's', token: 'abc' } }
    expect(await withoutSessionTokens(new Request('https://app.test/api/auth/get-session?next=/api/auth/token'), answer(session)).then((r) => r.json())).toEqual({ session: { id: 's' } })
    expect(await stripped('/token/', answer({ token: 'jwt' }))).toEqual({})
    expect(await withoutSessionTokens(new Request('https://app.test/api/auth/token?x=1'), answer({ token: 'jwt' })).then((r) => r.json())).toEqual({ token: 'jwt' })
  })

  it('keeps the status of an error', async () => {
    const response = await withoutSessionTokens(at('/get-session'), answer({ code: 'UNAUTHORIZED', token: 'abc' }, { status: 401 }))
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ code: 'UNAUTHORIZED' })
  })

  it('keeps a signed-out null and a token that is not a string', async () => {
    expect(await stripped('/get-session', answer(null))).toBeNull()
    expect(await stripped('/x', answer({ token: { id: 1, token: 'abc' } }))).toEqual({ token: { id: 1 } })
  })

  it('keeps a redirect labelled JSON with an empty body', async () => {
    const redirect = new Response('', { status: 302, headers: { 'content-type': 'application/json', location: '/next' } })
    const response = await withoutSessionTokens(at('/callback/github'), redirect)
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/next')
    expect(await response.text()).toBe('')
  })

  it('strips JSON whatever the casing of its content type', async () => {
    expect(await stripped('/get-session', answer({ token: 'abc' }, { contentType: 'Application/JSON; charset=utf-8' }))).toEqual({})
  })

  it('rejects malformed JSON without quoting it', async () => {
    const malformed = new Response('{"token":SECRET}', { headers: { 'content-type': 'application/json' } })
    const error = await withoutSessionTokens(at('/get-session'), malformed).catch((thrown: Error) => thrown)
    expect(error).toBeInstanceOf(Error)
    expect(`${(error as Error).message}${(error as Error).stack}`).not.toContain('SECRET')
  })
})
