import { describe, expect, it } from 'vitest'
import type { SenderAddressVerifier } from './sender-address-verifier'
import { senderVerifierList } from './verifier-list'

const verifier = (id: string): SenderAddressVerifier => ({ id, verify: async () => ({ state: 'failed', error_code: 'unused' }) })

describe('senderVerifierList', () => {
  it('holds the verifiers added while the app starts, in order', () => {
    const list = senderVerifierList()
    list.add_verifier(verifier('test-mail'))
    list.add_verifier(verifier('dns.txt'))
    expect(list.freeze().map(({ id }) => id)).toEqual(['test-mail', 'dns.txt'])
  })

  it('refuses an id twice, an empty one, and one that is no plain lowercase name', () => {
    const list = senderVerifierList()
    list.add_verifier(verifier('test-mail'))
    expect(() => list.add_verifier(verifier('test-mail'))).toThrow('two verifiers have the id "test-mail"')
    for (const id of ['', 'Test', 'test mail', '-test', 'a'.repeat(65)]) expect(() => list.add_verifier(verifier(id)), id).toThrow('add_verifier: the id')
  })

  it('refuses a verifier added after the app started', () => {
    const list = senderVerifierList()
    list.freeze()
    expect(() => list.add_verifier(verifier('late'))).toThrow('comes after the app started')
  })
})
