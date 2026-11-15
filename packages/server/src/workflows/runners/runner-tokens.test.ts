import { describe, expect, it } from 'vitest'
import { jobSealer } from './job-seal'
import { completionOf, logLinesOf, registrationOf, runnerStateOf } from './runner-bodies'
import { newRegistrationToken, newRunnerToken, registrationPattern, runnerTokenHash, runnerTokenPattern } from './runner-tokens'

describe("a runner's tokens", () => {
  it('are prefixed so each is told apart, one never passing for the other, and new each time', () => {
    const once = newRegistrationToken()
    const own = newRunnerToken()
    expect(once).toMatch(/^pbr_once_[A-Za-z0-9_-]{43}$/)
    expect(own).toMatch(/^pbr_[A-Za-z0-9_-]{43}$/)
    expect([registrationPattern.test(once), runnerTokenPattern.test(once)]).toEqual([true, false])
    expect([registrationPattern.test(own), runnerTokenPattern.test(own)]).toEqual([false, true])
    expect(newRunnerToken()).not.toBe(own)
  })

  it('are kept by their SHA-256 alone', async () => {
    expect(await runnerTokenHash('pbr_x')).toMatch(/^[0-9a-f]{64}$/)
    expect(await runnerTokenHash('pbr_x')).not.toContain('pbr_x')
  })
})

describe("a runner's bodies", () => {
  it('takes a registration with its platform and kinds', () => {
    expect(registrationOf({ token: 't', platform: 'linux/arm64', kinds: ['container'] })).toEqual({ token: 't', platform: 'linux/arm64', kinds: ['container'] })
    expect(registrationOf({ token: 't', platform: '', kinds: ['container'] })).toHaveProperty('problem')
    expect(registrationOf({ platform: 'linux/arm64', kinds: [] })).toHaveProperty('problem')
  })

  it('takes what a runner says of itself with its lists empty when left out, and refuses a part that is not one', () => {
    expect(runnerStateOf({ platform: 'linux/amd64', kinds: ['container'], capacity: { slots: 2 } })).toEqual({ platform: 'linux/amd64', kinds: ['container'], labels: [], capacity: { slots: 2 }, images: [], instances: [] })
    expect(runnerStateOf({ platform: 'linux/amd64', kinds: ['container'], capacity: { slots: 1, cpus: 4 }, images: [{ step: 'custom:ocr:1', snapshot: true, digest: 'x' }], instances: [{ step: 'custom:ocr:1', free: 2, idle_s: 3 }] })).toEqual({
      platform: 'linux/amd64', kinds: ['container'], labels: [], capacity: { slots: 1 }, images: [{ step: 'custom:ocr:1', snapshot: true }], instances: [{ step: 'custom:ocr:1', free: 2 }],
    })
    for (const changes of [{ capacity: { slots: -1 } }, { capacity: { slots: 1.5 } }, { kinds: 'container' }, { images: [{ step: 'custom:ocr:1', snapshot: 'yes' }] }, { instances: [{ step: 'custom:ocr:1' }] }, { labels: [1] }]) {
      expect(runnerStateOf({ platform: 'linux/amd64', kinds: ['container'], capacity: { slots: 1 }, ...changes })).toHaveProperty('problem')
    }
  })

  it('takes a completion as its output, any JSON, or its error with a cause', () => {
    expect(completionOf({ output: null })).toEqual({ output: null })
    expect(completionOf({ error: 'Refused', cause: 'no' })).toEqual({ error: 'Refused', cause: 'no' })
    expect(completionOf({ error: 'Refused' })).toEqual({ error: 'Refused' })
    expect(completionOf({ cause: 'no' })).toHaveProperty('problem')
    expect(completionOf({ error: 'Refused', cause: 3 })).toHaveProperty('problem')
    expect(logLinesOf({ lines: ['a', 'b'] })).toEqual(['a', 'b'])
    expect(logLinesOf({ lines: Array.from({ length: 101 }, () => 'a') })).toHaveProperty('problem')
  })
})

describe("a job's sealed arguments", () => {
  it('open only with the secret they were sealed with, holding nothing of them in clear', async () => {
    const sealer = jobSealer(async () => 'the-app-secret-0123456789abcdef')
    const sealed = await sealer.seal({ page: 'one', key: 'very-secret-value' })
    expect(sealed).not.toContain('very-secret-value')
    expect(await sealer.open(sealed)).toEqual({ value: { page: 'one', key: 'very-secret-value' } })
    expect(await jobSealer(async () => 'another-secret-0123456789abcdef').open(sealed)).toBeUndefined()
  })
})
