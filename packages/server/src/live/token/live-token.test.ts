import { jwtDecrypt } from 'jose'
import { describe, expect, it } from 'vitest'
import { liveTokenKey } from './live-key'
import { maxLiveTokenBytes, sealLiveToken } from './live-token'

const ticketKey = 'a-ticket-key-of-at-least-32-characters'
const now = new Date('2026-11-26T12:00:00Z')
const read = { resource: 'tasks', where: 'isNull(deleted_at) AND in(project_id, 1, 2)', fields: ['id', 'title'], snapshot: '100:104:101' }
const expiresAt = new Date('2026-11-26T13:00:00Z')

describe('sealLiveToken', () => {
  it("seals a signed-in person's read with their session, which only the key opens", async () => {
    const key = await liveTokenKey(ticketKey)
    const token = await sealLiveToken(key, 'shop', read, { user: 'u1', session: 's1', expiresAt }, now)
    expect(token!.split('.')).toHaveLength(5)
    const { payload, protectedHeader } = await jwtDecrypt(token!, key, { issuer: 'shop', currentDate: now })
    expect(protectedHeader).toEqual({ alg: 'dir', enc: 'A256GCM', typ: 'JWT' })
    expect(payload).toEqual({ ...read, sid: 's1', sub: 'u1', iss: 'shop', iat: now.getTime() / 1000, exp: expiresAt.getTime() / 1000 })
  })

  it("seals a visitor's read bound to no session", async () => {
    const key = await liveTokenKey(ticketKey)
    const { payload } = await jwtDecrypt((await sealLiveToken(key, 'shop', read, { anonymous: true, expiresAt }, now))!, key, { currentDate: now })
    expect(payload.anonymous).toBe(true)
    expect(payload.sub).toBeUndefined()
    expect(payload.sid).toBeUndefined()
  })

  it('derives a key apart from the ticket key itself, so a ticket key does not open it', async () => {
    const key = await liveTokenKey(ticketKey)
    expect(key).toHaveLength(32)
    expect(Buffer.from(key).toString()).not.toContain(ticketKey.slice(0, 32))
    const other = await liveTokenKey(`${ticketKey}-other`)
    const token = (await sealLiveToken(key, 'shop', read, { anonymous: true, expiresAt }, now))!
    await expect(jwtDecrypt(token, other, { currentDate: now })).rejects.toThrow()
  })

  it('gives no token longer than a proxy takes in a header', async () => {
    const key = await liveTokenKey(ticketKey)
    const long = { ...read, where: `in(project_id, ${Array.from({ length: 1000 }, (_, i) => i).join(', ')})` }
    expect(await sealLiveToken(key, 'shop', long, { anonymous: true, expiresAt }, now)).toBeUndefined()
    expect(maxLiveTokenBytes).toBeLessThan(4096)
  })
})
