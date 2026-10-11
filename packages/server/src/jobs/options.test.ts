import { describe, expect, it } from 'vitest'
import { queueOptions, queueSettingsDiffer, sendOptions } from './options'

const job = { name: 'send-invoice', run: () => {} }
const ordered = { ...job, ordered: true }

describe('queueOptions', () => {
  it('retries 9 times with backoff from 2 s up to an hour, each try up to 15 minutes', () => {
    expect(queueOptions(job)).toEqual({
      policy: 'standard',
      retryLimit: 9,
      retryDelay: 2,
      retryBackoff: true,
      retryDelayMax: 3600,
      expireInSeconds: 900,
    })
  })

  it('takes durations as text or milliseconds, rounded up to seconds', () => {
    expect(queueOptions({ ...job, maxAttempts: 1, retryDelay: 1500, maxRetryDelay: '1 day', timeout: '30 seconds' })).toMatchObject({
      retryLimit: 0,
      retryDelay: 2,
      retryDelayMax: 86400,
      expireInSeconds: 30,
    })
  })

  it('keeps an ordered job in a strict FIFO queue', () => {
    expect(queueOptions(ordered).policy).toBe('key_strict_fifo')
  })

  it('refuses settings pg-boss cannot take', () => {
    expect(() => queueOptions({ ...job, maxAttempts: 0 })).toThrow('Job "send-invoice" maxAttempts must be a whole number of at least 1, not 0')
    expect(() => queueOptions({ ...job, timeout: 0 })).toThrow('timeout in seconds must be a whole number of at least 1')
    expect(() => queueOptions({ ...job, retryDelay: 'soon' })).toThrow('retryDelay is "soon"')
  })
})

describe('queueSettingsDiffer', () => {
  it('compares what the definition sets, never the policy', () => {
    const wanted = queueOptions(job)
    expect(queueSettingsDiffer(wanted, { ...wanted, name: 'send-invoice', queuedCount: 3 })).toBe(false)
    expect(queueSettingsDiffer(wanted, { ...wanted, retryLimit: 2 })).toBe(true)
    expect(queueSettingsDiffer(wanted, { ...wanted, policy: 'key_strict_fifo' })).toBe(false)
  })
})

describe('sendOptions', () => {
  it('sends nothing for a plain enqueue', () => {
    expect(sendOptions(job)).toEqual({})
  })

  it('starts at a time or after a delay in whole seconds', () => {
    const runAt = new Date('2026-10-12T07:00:00Z')
    expect(sendOptions(job, { runAt })).toEqual({ startAfter: runAt })
    expect(sendOptions(job, { delay: '5 minutes' })).toEqual({ startAfter: 300 })
    expect(sendOptions(job, { delay: 1 })).toEqual({ startAfter: 1 })
    expect(() => sendOptions(job, { runAt, delay: 10 })).toThrow('pass runAt or delay, not both')
  })

  it('finds a keyed job by its key, and an ordered one by its group', () => {
    expect(sendOptions(job, { key: 'invoice:1', priority: 5 })).toEqual({ singletonKey: 'invoice:1', priority: 5 })
    expect(sendOptions(ordered, { group: 'customer:7' })).toEqual({ singletonKey: 'customer:7' })
  })

  it('refuses a group on an unordered job, and a key or no group on an ordered one', () => {
    expect(() => sendOptions(job, { group: 'a' })).toThrow('Job "send-invoice" is not ordered: a group needs ordered: true in defineJob')
    expect(() => sendOptions(ordered)).toThrow('is ordered: name the group each job runs in with { group }')
    expect(() => sendOptions(ordered, { group: 'a', key: 'b' })).toThrow('takes no key')
    expect(() => sendOptions(job, { mode: 'replace' })).toThrow('mode needs a key')
    expect(() => sendOptions(job, { priority: 1.5 })).toThrow('priority must be a whole number')
  })
})
