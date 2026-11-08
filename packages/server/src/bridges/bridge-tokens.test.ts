import { describe, expect, it } from 'vitest'
import { bridgeTokens, openWithinMs } from './bridge-tokens'

const grant = { caller: { user: { id: 'u1', roles: [] } }, target: 'db', host: '10.0.0.5', port: 5432, expiresAt: 3_600_000 }

const clock = () => {
  let at = 0
  return { now: () => at, pass: (ms: number) => void (at += ms) }
}

describe('bridgeTokens', () => {
  it('gives a token’s grant back once', () => {
    const tokens = bridgeTokens()
    const { token } = tokens.issue(grant)
    expect(tokens.take(token)).toEqual(grant)
    expect(tokens.take(token)).toBeUndefined()
  })

  it('opens nothing once the token’s opening window passed', () => {
    const { now, pass } = clock()
    const tokens = bridgeTokens({ now })
    const { token, openBy } = tokens.issue(grant)
    expect(openBy).toBe(openWithinMs)
    pass(openWithinMs)
    expect(tokens.take(token)).toBeUndefined()
  })

  it('knows no token it did not issue', () => {
    expect(bridgeTokens().take('made-up')).toBeUndefined()
  })

  it('drops expired tokens before refusing a new one for capacity', () => {
    const { now, pass } = clock()
    const tokens = bridgeTokens({ now, capacity: 1 })
    tokens.issue(grant)
    expect(() => tokens.issue(grant)).toThrow('Too many bridge tokens')
    pass(openWithinMs)
    expect(() => tokens.issue(grant)).not.toThrow()
  })

  it('drops a user’s oldest token past their share, leaving others’ alone', () => {
    const tokens = bridgeTokens({ perUser: 2 })
    const other = tokens.issue({ ...grant, caller: { user: { id: 'u2', roles: [] } } }).token
    const [first, second, third] = [tokens.issue(grant), tokens.issue(grant), tokens.issue(grant)].map((issued) => issued.token)
    expect(tokens.take(first!)).toBeUndefined()
    expect(tokens.take(second!)).toEqual(grant)
    expect(tokens.take(third!)).toEqual(grant)
    expect(tokens.take(other)).toBeDefined()
  })
})
