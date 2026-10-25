import { describe, expect, it } from 'vitest'
import { endReplacedSession, type ReplacingContext } from './end-replaced-session'

// A request whose signed session cookie holds `held`, and the sessions it deleted.
const request = (held: string | null | false) => {
  const deleted: string[] = []
  const ctx: ReplacingContext = {
    getSignedCookie: async (name, secret) => (name === 'protobase.session_token' && secret === 'secret' ? held : null),
    context: { authCookies: { sessionToken: { name: 'protobase.session_token' } }, secret: 'secret', internalAdapter: { deleteSession: async (token) => void deleted.push(token) } },
  }
  return { ctx, deleted }
}

describe('endReplacedSession', () => {
  it("ends the session the browser's cookie held when a new one starts", async () => {
    const { ctx, deleted } = request('old-token')
    await endReplacedSession({ token: 'new-token' }, ctx)
    expect(deleted).toEqual(['old-token'])
  })

  it('ends nothing without a cookie, with a forged one, for the same session, or outside a request', async () => {
    for (const held of [null, false] as const) {
      const { ctx, deleted } = request(held)
      await endReplacedSession({ token: 'new-token' }, ctx)
      expect(deleted).toEqual([])
    }
    const same = request('new-token')
    await endReplacedSession({ token: 'new-token' }, same.ctx)
    expect(same.deleted).toEqual([])
    await endReplacedSession({ token: 'new-token' }, null)
  })
})
