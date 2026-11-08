import { describe, expect, it } from 'vitest'
import { versionLabel } from './picker-labels'

describe('versionLabel', () => {
  it('says which version is the latest and which is live', () => {
    expect(versionLabel(13, { latest: 13, enabled: 12 })).toBe('Version 13, latest, not published')
    expect(versionLabel(12, { latest: 13, enabled: 12 })).toBe('Version 12, live')
    expect(versionLabel(13, { latest: 13, enabled: 13 })).toBe('Version 13, latest, live')
    expect(versionLabel(11, { latest: 13, enabled: 12 })).toBe('Version 11')
  })
})
