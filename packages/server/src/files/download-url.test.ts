import { describe, expect, it } from 'vitest'
import { downloadExpiry, readDownloadUrl, signedDownloadUrl } from './download-url'
import { createSigner } from './signer'

const signer = createSigner('a-test-secret')
const grant = { provider: 'private', path: '1/a.pdf', resource: 'products', key: '42', field: 'datasheet', expires: 7200 }

const queryOf = (url: string) => new URL(url, 'http://app').searchParams

describe('download URLs', () => {
  it('name one field of one row, and verify until they expire', async () => {
    const url = await signedDownloadUrl(signer, '/api/files', grant)
    expect(url).toMatch(/^\/api\/files\/private\/1\/a\.pdf\?r=products&k=42&f=datasheet&exp=7200&sig=[\w-]{43}$/)
    expect(await readDownloadUrl(signer, 'private', '1/a.pdf', queryOf(url), 7_000_000)).toEqual({ status: 'ok', grant })
    expect(await readDownloadUrl(signer, 'private', '1/a.pdf', queryOf(url), 7_200_001)).toEqual({ status: 'expired' })
  })

  it('refuse another file, row or field', async () => {
    const query = queryOf(await signedDownloadUrl(signer, '/api/files', grant))
    expect(await readDownloadUrl(signer, 'private', '1/b.pdf', query, 0)).toEqual({ status: 'invalid' })
    query.set('k', '43')
    expect(await readDownloadUrl(signer, 'private', '1/a.pdf', query, 0)).toEqual({ status: 'invalid' })
  })

  it('repeat within the hour, and stay valid at least an hour', () => {
    expect(downloadExpiry(Date.UTC(2026, 9, 11, 10, 5))).toBe(downloadExpiry(Date.UTC(2026, 9, 11, 10, 55)))
    expect(downloadExpiry(Date.UTC(2026, 9, 11, 10, 59)) * 1000 - Date.UTC(2026, 9, 11, 10, 59)).toBeGreaterThanOrEqual(3_600_000)
  })
})
