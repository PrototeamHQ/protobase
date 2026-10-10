import { afterEach, describe, expect, it, vi } from 'vitest'
import { requireEnv } from './require-env'

afterEach(() => vi.unstubAllEnvs())

describe('requireEnv', () => {
  it('returns a set variable and fails on a missing or empty one', () => {
    vi.stubEnv('PB_TEST_KEY', 'sk-1')
    expect(requireEnv('PB_TEST_KEY')).toBe('sk-1')
    vi.stubEnv('PB_TEST_KEY', '')
    expect(() => requireEnv('PB_TEST_KEY')).toThrow('The environment variable PB_TEST_KEY is not set')
    expect(() => requireEnv('PB_TEST_NEVER_SET')).toThrow('The environment variable PB_TEST_NEVER_SET is not set')
  })
})
