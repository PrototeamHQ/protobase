import { describe, expect, it } from 'vitest'
import { localFiles } from './local-files'
import { providerFromUrl, resolveProviders, retentionOf } from './providers'

describe('file providers', () => {
  it('come from the config, replaced or added by PROTOBASE_FILES_<NAME>', () => {
    const own = localFiles({ dir: 'own' })
    const providers = resolveProviders({ providers: { private: own, archive: localFiles({ dir: 'archive' }) } }, {
      PROTOBASE_FILES_ARCHIVE: 'file:///data/archive',
      PROTOBASE_FILES_MEDIA_LIBRARY: 'file:///data/media?public=1',
      PROTOBASE_FILES_RETENTION: '14d',
    }, ['private'])
    expect(Object.keys(providers).sort()).toEqual(['archive', 'media-library', 'private'])
    expect(providers.private).toBe(own)
    expect(providers['media-library']!.public).toBe(true)
  })

  it('default private and public to folders under data/files, and nothing else', () => {
    const providers = resolveProviders({}, {}, ['private', 'public'])
    expect(providers.public!.public).toBe(true)
    expect(providers.private!.public).toBe(false)
    expect(() => resolveProviders({}, {}, ['archive'])).toThrow('No file provider "archive": add it to files.providers in protobase.config.ts or set PROTOBASE_FILES_ARCHIVE')
  })

  it('read file: URLs, and refuse other schemes for now', () => {
    expect(providerFromUrl('file:///data/files/public?public_url=https://files.example.com/app&retention=0', 'X')).toMatchObject({ public: true, publicUrl: 'https://files.example.com/app', retention: 0 })
    expect(() => providerFromUrl('s3://bucket/prefix', 'PROTOBASE_FILES_ARCHIVE')).toThrow('PROTOBASE_FILES_ARCHIVE uses s3:; not implemented')
    expect(() => providerFromUrl('data/files', 'X')).toThrow('X is not a URL')
  })

  it('refuse names that are settings or not names', () => {
    expect(() => resolveProviders({ providers: { retention: localFiles({ dir: 'x' }) } }, {}, [])).toThrow('PROTOBASE_FILES_RETENTION is a setting')
    expect(() => resolveProviders({ providers: { Files: localFiles({ dir: 'x' }) } }, {}, [])).toThrow('is not a file provider name')
  })

  it('keep bytes a day by default, none for public providers, and the provider\'s own when set', () => {
    const retention = retentionOf({}, {})
    expect(retention(localFiles({ dir: 'a' }))).toBe(86_400_000)
    expect(retention(localFiles({ dir: 'a', public: true }))).toBe(0)
    expect(retention(localFiles({ dir: 'a', retention: '2 days' }))).toBe(172_800_000)
    expect(retentionOf({ retention: '1 day' }, { PROTOBASE_FILES_RETENTION: '14d' })(localFiles({ dir: 'a' }))).toBe(14 * 86_400_000)
  })
})
