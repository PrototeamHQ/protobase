import { describe, expect, it } from 'vitest'
import { localFiles } from './local-files'
import { storageProvider } from './storage-provider'

describe('storageProvider', () => {
  it("is `private` by default, as the environment configures it, with its quota", () => {
    const { name, provider } = storageProvider({}, { PROTOBASE_FILES_PRIVATE: 'file:///data/files/private?max_bytes=500MB' })
    expect(name).toBe('private')
    expect(provider.maxBytes).toBe(500e6)
  })

  it('is the one files.storage names, without a quota unless it has one', () => {
    const archive = localFiles({ dir: 'data/files/archive' })
    expect(storageProvider({ providers: { archive }, storage: { provider: 'archive' } }, {})).toEqual({ name: 'archive', provider: archive })
    expect(archive.maxBytes).toBeUndefined()
  })

  it('fails when the app keeps no Storage objects', () => {
    expect(() => storageProvider({ storage: false }, {})).toThrow('files.storage is false in protobase.config.ts, so the app keeps no Storage objects')
  })
})
