import { describe, expect, it } from 'vitest'
import { isSecretLike, listColumns, type UiField } from './ui-file'

const plain = (name: string): UiField => ({ name, type: 'text', role: 'plain' })

describe('listColumns', () => {
  it('never lists a secret-like column', () => {
    const fields = [{ name: 'id', type: 'integer', role: 'key' } as UiField, ...['email', 'password_hash', 'accessToken', 'private_key', 'api_key', 'name'].map(plain)]
    expect(listColumns(fields)).toEqual(['email', 'name'])
  })
})

describe('isSecretLike', () => {
  it('reads the words of snake and camel case names', () => {
    expect(['password', 'password_hash', 'passwordHash', 'refresh_token', 'idToken', 'client_secret', 'privateKey', 'API_KEY', 'salt'].filter((name) => !isSecretLike(name))).toEqual([])
    expect(['email', 'tokens_used_count', 'hashtag', 'monkey', 'key', 'private_notes'].filter(isSecretLike)).toEqual([])
  })
})
