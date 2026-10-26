import { describe, expect, it } from 'vitest'
import { versionedSecrets } from './secret-versions'

describe('versionedSecrets', () => {
  it('lists the current secret first, each with a version of its own that its order never changes', () => {
    const { secrets } = versionedSecrets('new', ['middle', 'old'])
    expect(secrets.map(({ value }) => value)).toEqual(['new', 'middle', 'old'])
    expect(new Set(secrets.map(({ version }) => version)).size).toBe(3)
    expect(secrets.every(({ version }) => Number.isInteger(version) && version >= 0)).toBe(true)
    const reordered = versionedSecrets('old', ['new']).secrets
    expect(reordered.find(({ value }) => value === 'new')!.version).toBe(secrets[0]!.version)
  })

  it('decrypts what predates versions with the oldest secret, and lists a repeated secret once', () => {
    expect(versionedSecrets('only').legacySecret).toBe('only')
    expect(versionedSecrets('new', ['middle', 'old']).legacySecret).toBe('old')
    expect(versionedSecrets('same', ['same']).secrets).toHaveLength(1)
  })
})
