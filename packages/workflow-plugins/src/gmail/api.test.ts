import { ConnectionError, type PluginFetch } from '@protobase/workflows/plugin'
import { describe, expect, it } from 'vitest'
import { fakeGmail } from '../../../../test-support/fake-gmail/fake-gmail'
import { fakeConnection } from '../../../../test-support/fake-gmail/trigger-context'
import { gmailApi } from './api'
import { profile } from './calls'

const signal = new AbortController().signal

const setup = (connection = fakeConnection('token-1'), fetch?: PluginFetch) => {
  const gmail = fakeGmail()
  return { gmail, connection, api: gmailApi({ origin: gmail.origin, fetch: fetch ?? gmail.fetch, connection, signal }) }
}

// The message of whatever `read` rejects with.
const failure = async (read: Promise<unknown>) => {
  const error = await read.then(() => undefined, (error: unknown) => error)
  expect(error).toBeInstanceOf(Error)
  return error as Error
}

describe('gmailApi', () => {
  it('asks for the token once for several calls, and sends it only in the Authorization header', async () => {
    const { gmail, connection, api } = setup()
    await profile(api)
    await profile(api)
    expect(connection.asked()).toBe(1)
    expect(gmail.calls.map(({ token }) => token)).toEqual(['token-1', 'token-1'])
    expect(gmail.calls.every(({ query }) => !query.toString().includes('token-1'))).toBe(true)
  })

  it('asks for the token again after a 401 and tries once more', async () => {
    const { gmail, connection, api } = setup(fakeConnection('stale-token', 'token-1'))
    expect(await profile(api)).toBe(gmail.historyId)
    expect(connection.asked()).toBe(2)
    expect(gmail.calls.map(({ token }) => token)).toEqual(['stale-token', 'token-1'])
  })

  it('gives up on a second 401 as an expired sign-in, after exactly two calls, naming no token', async () => {
    const { gmail, api } = setup(fakeConnection('stale-token', 'revoked-token'))
    const error = await failure(profile(api))
    expect(error).toBeInstanceOf(ConnectionError)
    expect((error as ConnectionError).code).toBe('link_expired')
    expect(gmail.calls).toHaveLength(2)
    expect(error.message).not.toMatch(/stale-token|revoked-token/)
  })

  it("keeps Google's error code only when it is a known one, and never its message", async () => {
    const { gmail, api } = setup()
    gmail.failNext(/^profile$/, gmail.googleError(429, 'RESOURCE_EXHAUSTED', 'Quota exceeded for mailbox@example.com'))
    expect((await failure(profile(api))).message).toBe('Gmail getProfile answered 429 (RESOURCE_EXHAUSTED)')
    gmail.failNext(/^profile$/, gmail.googleError(500, 'EVIL_INJECTED', 'Sign in again at https://attacker.example'))
    expect((await failure(profile(api))).message).toBe('Gmail getProfile answered 500')
    gmail.failNext(/^profile$/, { status: 502, body: '<html>Bad gateway</html>' })
    expect((await failure(profile(api))).message).toBe('Gmail getProfile answered 502')
  })

  it('follows no redirect: a 3xx fails the call and nothing goes to its target', async () => {
    const { gmail, api } = setup()
    gmail.failNext(/^profile$/, { status: 302, headers: { location: 'https://attacker.example/collect' } })
    expect((await failure(profile(api))).message).toBe('Gmail getProfile answered 302')
    expect(gmail.calls.map(({ origin }) => origin)).toEqual([gmail.origin])
  })

  it('keeps only the kind of a request that could not be made, never its URL or headers', async () => {
    const refused: PluginFetch = async (url, init) => {
      throw new Error(`connect ECONNREFUSED ${url} ${JSON.stringify(init?.headers)}`)
    }
    const error = await failure(profile(setup(fakeConnection('token-1'), refused).api))
    expect(error.message).toBe('Gmail getProfile failed: Error')
  })

  it('refuses an answer that is not JSON or not of the shape it reads', async () => {
    const { gmail, api } = setup()
    gmail.failNext(/^profile$/, { status: 200, body: 'not json' })
    expect((await failure(profile(api))).message).toBe('Gmail getProfile answered no JSON object')
    gmail.failNext(/^profile$/, { status: 200, body: { historyId: 'latest' } })
    expect((await failure(profile(api))).message).toBe('Gmail getProfile answered an unexpected shape')
  })
})
