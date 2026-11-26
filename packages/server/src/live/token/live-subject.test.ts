import { describe, expect, it } from 'vitest'
import { anonymousSession } from '../../anonymous'
import { liveSubject, liveTokenSeconds } from './live-subject'

const now = new Date('2026-11-26T12:00:00Z')
const hourLater = new Date(now.getTime() + liveTokenSeconds * 1000)
const signedIn = { user: { id: 7, roles: ['member'] }, signIn: { session: 's1', staff: false } }
const endingAt = (end: Date | undefined) => async () => end

describe('liveSubject', () => {
  it('gives a visitor an unbound token for the longest a token lasts', async () => {
    expect(await liveSubject(anonymousSession(), endingAt(undefined), now)).toEqual({ anonymous: true, expiresAt: hourLater })
  })

  it("binds a signed-in person's token to their session, until it ends", async () => {
    const soon = new Date(now.getTime() + 60_000)
    expect(await liveSubject(signedIn, endingAt(soon), now)).toEqual({ user: '7', session: 's1', expiresAt: soon })
    expect(await liveSubject(signedIn, endingAt(new Date(now.getTime() + 86_400_000)), now)).toEqual({ user: '7', session: 's1', expiresAt: hourLater })
  })

  it('gives none for an ended session, a caller without one, or an outside app', async () => {
    expect(await liveSubject(signedIn, endingAt(undefined), now)).toBeUndefined()
    expect(await liveSubject(signedIn, endingAt(now), now)).toBeUndefined()
    expect(await liveSubject({ user: { id: 7, roles: [] } }, endingAt(hourLater), now)).toBeUndefined()
    expect(await liveSubject({ ...signedIn, client: { id: 'mcp', scopes: [] } }, endingAt(hourLater), now)).toBeUndefined()
  })
})
