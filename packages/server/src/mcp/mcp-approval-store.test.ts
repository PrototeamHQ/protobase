import { createRequestStateCodec, type ServerContext } from '@modelcontextprotocol/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { approvalLifetime, approvalStore, mcpApprovals } from './mcp-approval-store'

const key = new Uint8Array(32).fill(7)
const scope = 'a'.repeat(64)
const call = 'b'.repeat(64)
const other = 'c'.repeat(64)
const start = Date.UTC(2026, 9, 25, 12)

// A state signed with `signingKey` around any payload, as a client holding the key could make.
const signed = (payload: unknown, signingKey: Uint8Array | string = key) => createRequestStateCodec({ key: signingKey }).mint(payload)
const decoded = (state: string) => JSON.parse(Buffer.from(state.split('.')[1]!, 'base64url').toString('utf8'))

beforeEach(() => vi.useFakeTimers({ now: start }))
afterEach(() => vi.useRealTimers())

describe('approvalStore', () => {
  it('takes back its own state for the same call once', async () => {
    const store = approvalStore({ key })
    const { state, nonce } = await store.ask(scope, call)
    expect(await store.check(scope, call, state)).toBe(nonce)
    expect(await store.check(scope, call, state)).toBeUndefined()
  })

  it('gives one of two checks of one state at once its nonce', async () => {
    const store = approvalStore({ key })
    const { state } = await store.ask(scope, call)
    const results = await Promise.all([store.check(scope, call, state), store.check(scope, call, state)])
    expect(results.filter(Boolean)).toHaveLength(1)
  })

  it('refuses a state for another call, and uses it up', async () => {
    const store = approvalStore({ key })
    const { state } = await store.ask(scope, call)
    expect(await store.check(scope, other, state)).toBeUndefined()
    expect(await store.check(scope, call, state)).toBeUndefined()
  })

  it('refuses a state in another scope, which leaves it to its own', async () => {
    const store = approvalStore({ key })
    const { state, nonce } = await store.ask(scope, call)
    expect(await store.check(other, call, state)).toBeUndefined()
    expect(await store.check(scope, call, state)).toBe(nonce)
  })

  it('lasts 10 minutes: taken a second before, refused at the instant', async () => {
    const store = approvalStore({ key })
    const first = await store.ask(scope, call)
    const second = await store.ask(scope, call)
    expect(decoded(first.state).p.expiresAt - start).toBe(approvalLifetime)
    expect(approvalLifetime).toBe(600_000)
    vi.setSystemTime(start + approvalLifetime - 1000)
    expect(await store.check(scope, call, first.state)).toBe(first.nonce)
    vi.setSystemTime(start + approvalLifetime)
    expect(await store.check(scope, call, second.state)).toBeUndefined()
  })

  it('refuses a state from another store, as after a restart or on another instance', async () => {
    const elsewhere = await approvalStore({ key: new Uint8Array(32).fill(9) }).ask(scope, call)
    const sameKey = await approvalStore({ key }).ask(scope, call)
    const store = approvalStore({ key })
    expect(await store.check(scope, call, elsewhere.state)).toBeUndefined()
    expect(await store.check(scope, call, sameKey.state)).toBeUndefined()
  })

  it('refuses malformed and forged states without throwing', async () => {
    const store = approvalStore({ key })
    const { state, nonce } = await store.ask(scope, call)
    const [prefix, body, mac] = state.split('.') as [string, string, string]
    const flip = (text: string, at: number) => `${text.slice(0, at)}${text[at] === 'A' ? 'B' : 'A'}${text.slice(at + 1)}`
    const payload = { purpose: 'mcp.approve', nonce, call, expiresAt: start + approvalLifetime }
    const forged = [
      '', 'v1.', 'v1..', state.slice(0, -5), `${prefix}.${flip(body, 5)}.${mac}`, `${prefix}.${body}.${flip(mac, 5)}`,
      await signed(payload, new Uint8Array(32).fill(1)), await signed(payload, 'x'.repeat(32)), `v1.${body}.`, 'x'.repeat(1_000_000),
    ]
    for (const bad of [...forged, { state }, [state], 1, null]) expect(await store.check(scope, call, bad)).toBeUndefined()
    expect(await store.check(scope, call, state)).toBe(nonce)
  })

  it('refuses a state signed with its own key whose payload is not a whole approval', async () => {
    const store = approvalStore({ key })
    const { nonce } = await store.ask(scope, call)
    const whole = { purpose: 'mcp.approve', nonce, call, expiresAt: start + approvalLifetime }
    const { expiresAt: _expiry, ...noExpiry } = whole
    const { nonce: _nonce, ...noNonce } = whole
    const { call: _call, ...noCall } = whole
    for (const payload of [noExpiry, noNonce, noCall, { ...whole, expiresAt: String(whole.expiresAt) }, { ...whole, call: null }, { ...whole, purpose: 'other' }, { ...whole, expiresAt: whole.expiresAt + 1 }, 'text', [whole], null]) {
      expect(await store.check(scope, call, await signed(payload))).toBeUndefined()
    }
  })

  it('takes nothing but its stored call, even from a state its own key signs for another', async () => {
    const store = approvalStore({ key })
    const { nonce } = await store.ask(scope, call)
    const later = await signed({ purpose: 'mcp.approve', nonce, call: other, expiresAt: start + approvalLifetime })
    expect(await store.check(scope, other, later)).toBeUndefined()
  })

  it('puts in the state only the purpose, nonce, call hash and expiry', async () => {
    const { state, nonce } = await approvalStore({ key }).ask(scope, call)
    const { p } = decoded(state)
    expect(p).toEqual({ purpose: 'mcp.approve', nonce, call, expiresAt: start + approvalLifetime })
    expect(state).not.toContain(Buffer.from(key).toString('base64url'))
    expect(Buffer.from(state.split('.')[1]!, 'base64url').toString('utf8')).not.toContain(scope)
  })

  it('counts a state the codec throws on as not counting', async () => {
    const store = approvalStore({ key })
    const { state } = await store.ask(scope, call)
    const verify = vi.spyOn(Object.getPrototypeOf(crypto.subtle), 'verify').mockRejectedValueOnce(new Error('broken'))
    expect(await store.check(scope, call, state)).toBeUndefined()
    verify.mockRestore()
  })

  it('drops only a scope\'s own oldest past its limit', async () => {
    const store = approvalStore({ key, perScope: 2 })
    const elsewhere = await store.ask(other, call)
    const oldest = await store.ask(scope, call)
    const kept = [await store.ask(scope, call), await store.ask(scope, call)]
    expect(await store.check(scope, call, oldest.state)).toBeUndefined()
    for (const { state, nonce } of kept) expect(await store.check(scope, call, state)).toBe(nonce)
    expect(await store.check(other, call, elsewhere.state)).toBe(elsewhere.nonce)
  })

  it('fails a new ask once the store is full, and keeps what waits', async () => {
    const store = approvalStore({ key, total: 2 })
    const waiting = [await store.ask('1'.repeat(64), call), await store.ask('2'.repeat(64), call)]
    await expect(store.ask(scope, call)).rejects.toThrow('Too many approvals')
    expect(await store.check('1'.repeat(64), call, waiting[0]!.state)).toBe(waiting[0]!.nonce)
    expect(await store.check('2'.repeat(64), call, waiting[1]!.state)).toBe(waiting[1]!.nonce)
  })

  it('makes room as approvals expire', async () => {
    const store = approvalStore({ key, total: 1 })
    await store.ask(scope, call)
    vi.setSystemTime(start + approvalLifetime)
    await expect(store.ask(scope, call)).resolves.toMatchObject({ nonce: expect.any(String) })
  })
})

describe('mcpApprovals', () => {
  it('signs with a key of its own, so no other store takes its states', async () => {
    const first = mcpApprovals()
    const { state, nonce } = await first.ask(scope, call)
    expect(await mcpApprovals().check(scope, call, state)).toBeUndefined()
    expect(await first.check(scope, call, state)).toBe(nonce)
    await expect(createRequestStateCodec({ key }).verify(state, undefined as unknown as ServerContext)).rejects.toThrow('mac')
  })
})
