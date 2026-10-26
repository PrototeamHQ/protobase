import { describe, expect, it } from 'vitest'
import { placeholderSecretWarning } from './placeholder-secret'

describe('placeholderSecretWarning', () => {
  it('warns about the placeholder of .env.example', () => {
    expect(placeholderSecretWarning({ PROTOBASE_SECRET: 'change-me-generate-with-openssl-rand-base64-32' })).toContain('openssl rand -base64 32')
    expect(placeholderSecretWarning({ PROTOBASE_SECRET: 'CHANGEME' })).toBeDefined()
  })

  it('says nothing of a secret of the project, or none', () => {
    expect(placeholderSecretWarning({ PROTOBASE_SECRET: 'q3W8m0rT1y9c5xV2bN7kL4hJ6gF0dS8a' })).toBeUndefined()
    expect(placeholderSecretWarning({})).toBeUndefined()
  })
})
