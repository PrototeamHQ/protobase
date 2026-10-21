import { describe, expect, it } from 'vitest'
import { bucketLines, overQuota, totalBytes } from './storage-sizes'

const object = (bucket: string, size: number | undefined) => ({ bucket, name: 'x', version: null, size, eTag: undefined })

describe('storage sizes', () => {
  it('sums the recorded sizes per bucket, an unrecorded one as empty', () => {
    const objects = [object('avatars', 1_500_000), object('avatars', undefined), object('docs', 250_000)]
    expect(totalBytes(objects)).toBe(1_750_000)
    expect(bucketLines(objects)).toEqual(['  avatars: 2 objects, 1.5 MB\n', '  docs: 1 object, 0.3 MB\n'])
  })

  it('stops when what is left to copy and what the store holds exceed its quota', () => {
    expect(overQuota(600e6, 0, 500e6)).toBe(
      'The objects still to copy take 600.0 MB and the file provider holds 0.0 MB already, more than its 500.0 MB: pick a larger plan or raise its max_bytes, or pass --yes to copy until it is full',
    )
    expect(overQuota(300e6, 250e6, 500e6)).toContain('take 300.0 MB and the file provider holds 250.0 MB')
  })

  it('goes on within the quota, as a rerun does once what it copied is in the store, and without one', () => {
    expect(overQuota(100e6, 400e6, 500e6)).toBeUndefined()
    expect(overQuota(0, 500e6, 500e6)).toBeUndefined()
    expect(overQuota(10e9, 0, undefined)).toBeUndefined()
  })
})
