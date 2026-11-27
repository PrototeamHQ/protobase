import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MailSenderVerification } from '@protobase/client'
import { runVerification, verifyDeadline, verifyInterval, type VerificationState } from './verification-run'

const pending: MailSenderVerification = { verifier: 'test-mail', state: 'pending', expiresAt: '2026-08-02T00:00:00.000Z' }
const verified: MailSenderVerification = { verifier: 'test-mail', state: 'verified', settledAt: '2026-08-01T00:01:00.000Z', validUntil: '2026-10-30T00:00:00.000Z' }

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

// Each read answers the next of `answers` after `delay` milliseconds of the fake clock, or pending once they run out; with `fails`, it rejects instead.
const run = (started: MailSenderVerification[], answers: MailSenderVerification[][], { delay = 0, stopAfter = Infinity, fails = false } = {}) => {
  const states: VerificationState[] = []
  const read = vi.fn(async () => {
    const answer = answers.shift() ?? [pending]
    await sleep(delay)
    if (fails) throw new Error('read failed')
    return answer
  })
  const wait = vi.fn(sleep)
  const done = runVerification({ start: async () => started, read, wait, now: Date.now, stopped: () => read.mock.calls.length >= stopAfter, onState: (state) => states.push(state) })
  return { states, read, wait, done }
}

const settle = async (done: Promise<void>) => {
  await vi.runAllTimersAsync()
  await done
}

describe('a From address verification', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reads it again every interval while it is pending, and shows how it settled', async () => {
    const { states, read, wait, done } = run([pending], [[pending], [verified]])
    await settle(done)
    expect(states).toEqual([{ status: 'pending' }, { status: 'settled', verifications: [verified] }])
    expect(read).toHaveBeenCalledTimes(2)
    expect(wait).toHaveBeenCalledWith(verifyInterval)
  })

  it('shows at once a verification that settled as it started', async () => {
    const { states, read, done } = run([verified], [])
    await settle(done)
    expect(states.at(-1)).toEqual({ status: 'settled', verifications: [verified] })
    expect(read).not.toHaveBeenCalled()
  })

  it('times out at its deadline, however many reads that took', async () => {
    const start = Date.now()
    const { states, read, done } = run([pending], [], { delay: 7000 })
    await settle(done)
    expect(Date.now() - start).toBe(verifyDeadline)
    expect(read.mock.calls.length).toBeLessThan(verifyDeadline / verifyInterval)
    expect(states).toEqual([{ status: 'pending' }, { status: 'timed_out' }])
  })

  it('gives each request at most the time left', async () => {
    const { wait, done } = run([pending], [], { delay: 7000 })
    const start = Date.now()
    const asked: number[] = []
    wait.mockImplementation((ms) => {
      asked.push(Date.now() - start + ms)
      return sleep(ms)
    })
    await settle(done)
    expect(Math.max(...asked)).toBe(verifyDeadline)
  })

  it('keeps the timed-out outcome when the answer comes after the deadline', async () => {
    const { states, done } = run([pending], [[pending], [verified]], { delay: verifyDeadline })
    await settle(done)
    expect(states).toEqual([{ status: 'pending' }, { status: 'timed_out' }])
  })

  it('keeps the timed-out outcome when a request fails at the deadline', async () => {
    const { states, done } = run([pending], [], { delay: verifyDeadline - verifyInterval, fails: true })
    await settle(done)
    expect(states).toEqual([{ status: 'pending' }, { status: 'timed_out' }])
  })

  it('rejects as a request fails before the deadline', async () => {
    const { states, done } = run([pending], [], { delay: 1000, fails: true })
    const failed = expect(done).rejects.toThrow('read failed')
    await vi.runAllTimersAsync()
    await failed
    expect(states).toEqual([{ status: 'pending' }])
  })

  it('shows an answer that comes just before the deadline', async () => {
    const { states, done } = run([pending], [[verified]], { delay: verifyDeadline - verifyInterval - 1 })
    await settle(done)
    expect(states).toEqual([{ status: 'pending' }, { status: 'settled', verifications: [verified] }])
  })

  it('stops, reporting nothing more, once it is left', async () => {
    const { states, read, done } = run([pending], [], { stopAfter: 1 })
    await settle(done)
    expect(read).toHaveBeenCalledTimes(1)
    expect(states).toEqual([{ status: 'pending' }])
  })
})
