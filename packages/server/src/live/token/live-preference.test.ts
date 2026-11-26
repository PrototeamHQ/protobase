import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { liveHeaders } from './live-headers'
import { asksLive } from './live-preference'

const app = new Hono().get('/', (c) => c.text(String(asksLive(c))))
const asks = async (path: string, prefer?: string) => (await app.request(path, prefer === undefined ? {} : { headers: { prefer } })).text()

describe('asksLive', () => {
  it('takes Prefer: live, alone or among other preferences', async () => {
    expect(await asks('/', 'live')).toBe('true')
    expect(await asks('/', 'return=minimal, LIVE')).toBe('true')
    expect(await asks('/', 'live; strict')).toBe('true')
  })

  it('takes ?live=1 where a page sets no headers', async () => {
    expect(await asks('/?live=1')).toBe('true')
  })

  it('takes nothing else', async () => {
    expect(await asks('/')).toBe('false')
    expect(await asks('/', 'lively, return=live')).toBe('false')
    expect(await asks('/?live=true')).toBe('false')
  })
})

describe('liveHeaders', () => {
  it('always varies with Prefer, and names the token only when there is one', () => {
    expect(liveHeaders(undefined)).toEqual({ Vary: 'Prefer' })
    expect(liveHeaders('t')).toEqual({ Vary: 'Prefer', 'Preference-Applied': 'live', 'Protobase-Live': 't' })
  })
})
