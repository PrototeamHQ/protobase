import { describe, expect, it, vi } from 'vitest'
import type { SenderAddressVerifier } from './sender-address-verifier'
import type { ClaimedVerification, VerificationStore } from './verification-store'
import { sweepVerifications } from './verification-sweep'

const claimed = (id: string, verifier = 'test-mail'): ClaimedVerification => ({ id, verifier, address: `${id}@shop.example`, name: null })
const later = new Date(Date.now() + 3_600_000)

// The store's calls, each recorded; each claim answers the next batch of `batches`.
const storeOf = (batches: ClaimedVerification[][]) =>
  ({
    expireDue: vi.fn(async () => {}),
    claimDue: vi.fn(async () => batches.shift() ?? []),
    settle: vi.fn(async () => true),
  }) as unknown as VerificationStore & Record<'expireDue' | 'claimDue' | 'settle', ReturnType<typeof vi.fn>>

const verify = async () => ({ state: 'failed' as const, error_code: 'unused' })

describe('sweepVerifications', () => {
  it('expires what ran out of time, also with no verifier that checks, and then claims nothing', async () => {
    const store = storeOf([])
    await sweepVerifications([{ id: 'push-only', verify }], store)
    expect(store.expireDue).toHaveBeenCalledTimes(1)
    expect(store.claimDue).not.toHaveBeenCalled()
  })

  it("claims only the checking verifiers' due verifications, checks each, and records each outcome", async () => {
    const store = storeOf([[claimed('v1'), claimed('v2')]])
    const check = vi.fn(async ({ verification_id }: { verification_id: string }) => (verification_id === 'v1' ? { state: 'verified' as const, valid_until: later } : { state: 'pending' as const }))
    await sweepVerifications([{ id: 'test-mail', verify, check }, { id: 'push-only', verify }], store)
    expect(store.claimDue).toHaveBeenCalledWith(['test-mail'], 100)
    expect(check).toHaveBeenCalledWith({ verification_id: 'v1', address: 'v1@shop.example' })
    expect(store.settle).toHaveBeenCalledWith({ id: 'v1' }, 'test-mail', { state: 'verified', valid_until: later })
    expect(store.settle).toHaveBeenCalledWith({ id: 'v2' }, 'test-mail', { state: 'pending' })
  })

  it('claims batch after batch until one is not full', async () => {
    const full = Array.from({ length: 100 }, (_, i) => claimed(`v${i}`))
    const store = storeOf([full, [claimed('last')]])
    await sweepVerifications([{ id: 'test-mail', verify, check: async () => ({ state: 'pending' }) }], store)
    expect(store.claimDue).toHaveBeenCalledTimes(2)
    expect(store.settle).toHaveBeenCalledTimes(101)
  })

  it("fails an outcome that is not valid as verifier_error, leaves a throwing check's verification pending, and throws once every one had its turn", async () => {
    const store = storeOf([[claimed('v1'), claimed('v2'), claimed('v3')]])
    const failure = new Error('The verifier service is down')
    const check = async ({ verification_id }: { verification_id: string }) => {
      if (verification_id === 'v1') throw failure
      return verification_id === 'v2' ? { state: 'verified' as const, valid_until: new Date(0) } : { state: 'verified' as const, valid_until: later }
    }
    const verifier: SenderAddressVerifier = { id: 'test-mail', verify, check }
    await expect(sweepVerifications([verifier], store)).rejects.toMatchObject({ errors: [failure] })
    expect(store.settle).not.toHaveBeenCalledWith({ id: 'v1' }, expect.anything(), expect.anything())
    expect(store.settle).toHaveBeenCalledWith({ id: 'v2' }, 'test-mail', { state: 'failed', error_code: 'verifier_error' })
    expect(store.settle).toHaveBeenCalledWith({ id: 'v3' }, 'test-mail', { state: 'verified', valid_until: later })
  })
})
