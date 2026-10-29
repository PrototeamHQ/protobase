import { describe, expect, it, vi } from 'vitest'
import { f, resource } from '@protobase/schema'
import type { Deps } from '../deps'
import { buildRegistry } from '../registry'
import { fieldDecrypter } from './decrypt-field'
import { encryptionKeyring } from './keyring'

const targets = resource('targets').table('targets').fields({ id: f.integer().readOnly(), host: f.text(), password: f.text().optional().encrypted() }).primaryKey((r) => r.id)

// A database that is never reached: each refusal comes before the read.
const decrypt = () => {
  const publish = vi.fn()
  const db = new Proxy({}, { get: () => { throw new Error('queried') } })
  const keyring = encryptionKeyring({ PROTOBASE_ENCRYPTION_KEY: Buffer.from(Array.from({ length: 32 }, (_, i) => i)).toString('base64') })
  const deps = { registry: buildRegistry([targets]), db, statementTimeoutMs: 1000, audit: { publish }, encryption: { keyring } } as unknown as Deps
  return { read: fieldDecrypter(deps)({ job: 'dispatch' }), publish }
}

describe('fieldDecrypter', () => {
  it('refuses, naming it, a resource that is unknown and a field that is missing or not encrypted, before any read or audit', async () => {
    const { read, publish } = decrypt()
    await expect(read('shares', 1, 'password')).rejects.toThrow('Unknown resource "shares"')
    await expect(read('targets', 1, 'host')).rejects.toThrow('"targets.host" is not an encrypted field')
    await expect(read('targets', 1, 'secret')).rejects.toThrow('"targets.secret" is not an encrypted field')
    await expect(read('targets', 1, 'toString')).rejects.toThrow('"targets.toString" is not an encrypted field')
    expect(publish).not.toHaveBeenCalled()
  })

  it('refuses a key with another number of parts than the primary key', async () => {
    const { read } = decrypt()
    await expect(read('targets', [1, 2], 'password')).rejects.toThrow('A targets key has 1 parts, not 2')
  })
})
