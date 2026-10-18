import { solveChallenge } from 'altcha-lib'
import { deriveKey } from 'altcha-lib/algorithms/web/sha'
import { describe, expect, it } from 'vitest'
import { createFormChallenges } from './challenge'

const difficulty = { min: 1, max: 20 }
const solve = async (challenge: Awaited<ReturnType<ReturnType<typeof createFormChallenges>['issue']>>) => ({ challenge, solution: (await solveChallenge({ challenge, deriveKey }))! })

describe('createFormChallenges', () => {
  it('verifies a solved challenge once, for the form it was made for', async () => {
    const challenges = createFormChallenges('secret', { difficulty })
    const proof = await solve(await challenges.issue('contact'))
    expect(await challenges.verify('contact', proof)).toBe('ok')
    expect(await challenges.verify('contact', proof)).toBe('replayed')
  })

  it('refuses a challenge made for another form, or signed with another secret', async () => {
    const challenges = createFormChallenges('secret', { difficulty })
    expect(await challenges.verify('newsletter', await solve(await challenges.issue('contact')))).toBe('invalid')
    const other = createFormChallenges('other secret', { difficulty })
    expect(await challenges.verify('contact', await solve(await other.issue('contact')))).toBe('invalid')
  })

  it('refuses a tampered challenge, a wrong solution and something that is no proof', async () => {
    const challenges = createFormChallenges('secret', { difficulty })
    const proof = await solve(await challenges.issue('contact'))
    const easier = { ...proof, challenge: { ...proof.challenge, parameters: { ...proof.challenge.parameters, keyPrefix: '00' } } }
    expect(await challenges.verify('contact', easier)).toBe('invalid')
    expect(await challenges.verify('contact', { ...proof, solution: { ...proof.solution, derivedKey: '00'.repeat(32) } })).toBe('invalid')
    for (const junk of [undefined, null, 'proof', {}, { challenge: proof.challenge }]) expect(await challenges.verify('contact', junk)).toBe('invalid')
    expect(await challenges.verify('contact', proof)).toBe('ok')
  })

  it('refuses a challenge five minutes after it was made', async () => {
    const issuedAt = Date.now() - 5 * 60 * 1000 - 1000
    const challenges = createFormChallenges('secret', { difficulty, now: () => issuedAt })
    expect(await challenges.verify('contact', await solve(await challenges.issue('contact')))).toBe('expired')
  })

  it('makes the browser count to a number in the range', async () => {
    const challenges = createFormChallenges('secret', { difficulty: { min: 30, max: 40 } })
    const { solution } = await solve(await challenges.issue('contact'))
    expect(solution.counter).toBeGreaterThanOrEqual(30)
    expect(solution.counter).toBeLessThanOrEqual(40)
  })
})
