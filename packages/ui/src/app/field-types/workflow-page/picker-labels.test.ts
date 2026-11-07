import { describe, expect, it } from 'vitest'
import { versionLabel } from './picker-labels'

describe("a workflow's version as its selector names it", () => {
  it('says which version is the latest and which is enabled, in words', () => {
    const at = '2026-11-04T09:00:00Z'
    expect(versionLabel(4, at, { latest: 4, enabled: 2 })).toMatch(/^Version 4, saved .+ \(latest\)$/)
    expect(versionLabel(2, at, { latest: 4, enabled: 2 })).toMatch(/^Version 2, saved .+ \(enabled\)$/)
    expect(versionLabel(3, at, { latest: 3, enabled: 3 })).toMatch(/\(latest, enabled\)$/)
    expect(versionLabel(1, at, { latest: 4, enabled: undefined })).toMatch(/^Version 1, saved [^(]+$/)
  })
})
