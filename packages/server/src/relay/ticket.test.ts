import { jwtVerify } from 'jose'
import { describe, expect, it } from 'vitest'
import { signTicket } from './ticket'

const options = { app: 'chat', ticketKey: 't'.repeat(32) }
const verify = (ticket: string) => jwtVerify(ticket, new TextEncoder().encode(options.ticketKey), { algorithms: ['HS256'], issuer: 'chat' })

describe('signTicket', () => {
  it("names a signed-in person, their sign-in session and their channels, for a minute", async () => {
    const now = new Date('2026-11-21T10:00:00Z')
    const { ticket, expiresAt } = await signTicket(options, { user: 'u1', session: 's1' }, ['conversations/7'], now)
    const { payload } = await jwtVerify(ticket, new TextEncoder().encode(options.ticketKey), { algorithms: ['HS256'], issuer: 'chat', currentDate: now })
    expect(payload).toMatchObject({ iss: 'chat', sub: 'u1', sid: 's1', channels: ['conversations/7'], exp: now.getTime() / 1000 + 60 })
    expect(payload.anonymous).toBeUndefined()
    expect(typeof payload.jti).toBe('string')
    expect(expiresAt).toEqual(new Date('2026-11-21T10:01:00Z'))
  })

  it('names an anonymous session without a subject', async () => {
    const { ticket } = await signTicket(options, { anonymous: true, session: 'anonymous:1' }, ['rooms/1'])
    const { payload } = await verify(ticket)
    expect(payload).toMatchObject({ anonymous: true, sid: 'anonymous:1', channels: ['rooms/1'] })
    expect(payload.sub).toBeUndefined()
  })

  it('gives each ticket an id of its own, so each connects once', async () => {
    const [a, b] = await Promise.all([signTicket(options, { user: 'u1', session: 's1' }, []), signTicket(options, { user: 'u1', session: 's1' }, [])])
    expect((await verify(a.ticket)).payload.jti).not.toBe((await verify(b.ticket)).payload.jti)
  })
})
