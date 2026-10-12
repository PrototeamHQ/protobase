import { describe, expect, it, vi } from 'vitest'
import { localFiles } from './local-files'
import { providerFromUrl, resolveProviders, retentionOf } from './providers'
import { s3Files } from './s3-files'

vi.mock('./s3-files', async (load) => {
  const actual = await load<typeof import('./s3-files')>()
  return { ...actual, s3Files: vi.fn(actual.s3Files) }
})

const r2 = 's3://acme-files/apps/42/private?endpoint=https://account.eu.r2.cloudflarestorage.com&region=auto'

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

  it('read file: URLs', () => {
    expect(providerFromUrl('file:///data/files/public?public_url=https://files.example.com/app&retention=0', 'X')).toMatchObject({ public: true, publicUrl: 'https://files.example.com/app', retention: 0 })
    expect(() => providerFromUrl('ftp://host/files', 'PROTOBASE_FILES_ARCHIVE')).toThrow('PROTOBASE_FILES_ARCHIVE uses ftp:; not implemented')
    expect(() => providerFromUrl('data/files', 'X')).toThrow('X is not a URL')
  })

  it('read s3: URLs, with the provider\'s own credentials from the environment, else S3_ or AWS_ ones', () => {
    const env = { X_ACCESS_KEY_ID: 'own-id', X_SECRET_ACCESS_KEY: 'own-secret', S3_ACCESS_KEY_ID: 'shared-id', S3_SECRET_ACCESS_KEY: 'shared-secret' }
    const provider = providerFromUrl(`${r2}&public_url=https://files.example.com&retention=0&max_bytes=1GB&max_files=20000`, 'X', env)
    expect(provider).toMatchObject({ public: true, publicUrl: 'https://files.example.com/apps/42/private', retention: 0 })
    expect(vi.mocked(s3Files)).toHaveBeenLastCalledWith({
      bucket: 'acme-files', prefix: '/apps/42/private', endpoint: 'https://account.eu.r2.cloudflarestorage.com', region: 'auto',
      accessKeyId: 'own-id', secretAccessKey: 'own-secret', public: false, publicUrl: 'https://files.example.com', retention: '0', maxBytes: '1GB', maxFiles: 20000,
    })
    providerFromUrl('s3://acme-files', 'Y', env)
    expect(vi.mocked(s3Files)).toHaveBeenLastCalledWith(expect.objectContaining({ bucket: 'acme-files', prefix: '', accessKeyId: 'shared-id', secretAccessKey: 'shared-secret' }))
    providerFromUrl('s3://acme-files', 'Y', { AWS_ACCESS_KEY_ID: 'aws-id', AWS_SECRET_ACCESS_KEY: 'aws-secret' })
    expect(vi.mocked(s3Files)).toHaveBeenLastCalledWith(expect.objectContaining({ accessKeyId: 'aws-id' }))
  })

  it('refuse s3: URLs without credentials, with them in the URL, or with a limit that is no number', () => {
    expect(() => providerFromUrl(r2, 'PROTOBASE_FILES_ARCHIVE')).toThrow('PROTOBASE_FILES_ARCHIVE needs credentials: set PROTOBASE_FILES_ARCHIVE_ACCESS_KEY_ID and PROTOBASE_FILES_ARCHIVE_SECRET_ACCESS_KEY')
    expect(() => providerFromUrl(r2, 'X', { X_ACCESS_KEY_ID: 'id' })).toThrow('Set both X_ACCESS_KEY_ID and X_SECRET_ACCESS_KEY, or neither')
    expect(() => providerFromUrl('s3://id:secret@acme-files', 'X')).toThrow('X must not hold credentials')
    expect(() => providerFromUrl('file:///data?max_files=lots', 'X')).toThrow('X has max_files=lots; write a whole number of files')
  })

  it('take credential variables as credentials, never as providers', () => {
    const providers = resolveProviders({}, {
      PROTOBASE_FILES_ARCHIVE: 's3://acme-files/archive',
      PROTOBASE_FILES_ARCHIVE_ACCESS_KEY_ID: 'id',
      PROTOBASE_FILES_ARCHIVE_SECRET_ACCESS_KEY: 'secret',
    }, [])
    expect(Object.keys(providers)).toEqual(['archive'])
    expect(() => resolveProviders({ providers: { 'old-access-key-id': localFiles({ dir: 'x' }) } }, {}, [])).toThrow('variables ending in _ACCESS_KEY_ID hold credentials')
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
