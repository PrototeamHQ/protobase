import { describe, expect, it, vi } from 'vitest'
import type { MailSenderVerification } from '@protobase/client'
import { runVerification, verifyAttempts, verifyInterval, type VerificationState } from './verification-run'

const pending: MailSenderVerification = { verifier: 'test-mail', state: 'pending', expiresAt: '2026-08-02T00:00:00.000Z' }
const verified: MailSenderVerification = { verifier: 'test-mail', state: 'verified', settledAt: '2026-08-01T00:01:00.000Z', validUntil: '2026-10-30T00:00:00.000Z' }

const run = (started: MailSenderVerification[], answers: MailSenderVerification[][], stopAfter = Infinity) => {
  const states: VerificationState[] = []
  const read = vi.fn(async () => answers.shift() ?? [pending])
  const wait = vi.fn(async (_ms: number) => {})
  const done = runVerification({ start: async () => started, read, wait, stopped: () => read.mock.calls.length >= stopAfter, onState: (state) => states.push(state) })
  return { states, read, wait, done }
}

describe('a From address verification', () => {
  it('reads it again every interval while it is pending, and shows how it settled', async () => {
    const { states, read, wait, done } = run([pending], [[pending], [verified]])
    await done
    expect(states).toEqual([{ status: 'pending' }, { status: 'settled', verifications: [verified] }])
    expect(read).toHaveBeenCalledTimes(2)
    expect(wait).toHaveBeenCalledWith(verifyInterval)
  })

  it('shows at once a verification that settled as it started', async () => {
    const { states, read, done } = run([verified], [])
    await done
    expect(states.at(-1)).toEqual({ status: 'settled', verifications: [verified] })
    expect(read).not.toHaveBeenCalled()
  })

  it('stops asking after its last attempt', async () => {
    const { states, read, done } = run([pending], [])
    await done
    expect(read).toHaveBeenCalledTimes(verifyAttempts)
    expect(states).toEqual([{ status: 'pending' }, { status: 'timed_out' }])
  })

  it('stops, reporting nothing more, once it is left', async () => {
    const { states, read, done } = run([pending], [], 1)
    await done
    expect(read).toHaveBeenCalledTimes(1)
    expect(states).toEqual([{ status: 'pending' }])
  })
})
