import { describe, expect, it, vi } from 'vitest'
import type { PersonalMail } from '../personal-mailer'
import type { SenderAddressVerifier } from './sender-address-verifier'
import { startVerification } from './start-verification'
import type { VerificationStore } from './verification-store'

const sender = { id: 'sender-1', address: 'billing@shop.example', name: 'Shop billing' }
const later = new Date(Date.now() + 3_600_000)

// The store's calls, each recorded; `started` is what starting a verification answers.
const storeOf = (started: string | undefined) =>
  ({
    expireOverdue: vi.fn(async () => {}),
    start: vi.fn(async () => started),
    settle: vi.fn(async () => true),
  }) as unknown as VerificationStore & Record<'expireOverdue' | 'start' | 'settle', ReturnType<typeof vi.fn>>

const mail = { send: vi.fn() } as unknown as PersonalMail

const verifierOf = (verify: SenderAddressVerifier['verify']): SenderAddressVerifier => ({ id: 'test-mail', verify: vi.fn(verify) })

describe('startVerification', () => {
  it("expires an overdue one first, stores the new one before verify runs, hands verify the secret, and records verify's first outcome", async () => {
    const store = storeOf('verification-1')
    const verifier = verifierOf(async () => ({ state: 'pending', expires_at: later }))
    await startVerification(verifier, store, mail, sender, 'en')
    expect(store.expireOverdue).toHaveBeenCalledWith('sender-1', 'test-mail')
    const [, , hash] = store.start.mock.calls[0]!
    const [input] = (verifier.verify as ReturnType<typeof vi.fn>).mock.calls[0]!
    expect(input).toEqual({ verification_id: 'verification-1', address: 'billing@shop.example', name: 'Shop billing', secret: expect.any(String), locale: 'en' })
    expect(hash).not.toBe(input.secret)
    expect(store.settle).toHaveBeenCalledWith({ id: 'verification-1' }, 'test-mail', { state: 'pending', expires_at: later }, true)
  })

  it('runs no verify, and so sends nothing, while one is pending already', async () => {
    const store = storeOf(undefined)
    const verifier = verifierOf(async () => ({ state: 'pending', expires_at: later }))
    await startVerification(verifier, store, mail, sender, 'en')
    expect(verifier.verify).not.toHaveBeenCalled()
    expect(store.settle).not.toHaveBeenCalled()
  })

  it('fails the verification as verifier_error on an outcome that is not valid, such as pending without expires_at', async () => {
    const store = storeOf('verification-1')
    await startVerification(verifierOf(async () => ({ state: 'pending' })), store, mail, sender, 'en')
    expect(store.settle).toHaveBeenCalledWith({ id: 'verification-1' }, 'test-mail', { state: 'failed', error_code: 'verifier_error' }, true)
  })

  it('fails the verification as verifier_error when verify throws, and throws on', async () => {
    const store = storeOf('verification-1')
    const failure = new Error('The verifier service is down')
    await expect(startVerification(verifierOf(async () => Promise.reject(failure)), store, mail, sender, 'en')).rejects.toBe(failure)
    expect(store.settle).toHaveBeenCalledWith({ id: 'verification-1' }, 'test-mail', { state: 'failed', error_code: 'verifier_error' })
  })
})
