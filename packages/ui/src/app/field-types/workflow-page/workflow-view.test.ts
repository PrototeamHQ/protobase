import { describe, expect, it } from 'vitest'
import { closedRunAddress, runAddress, versionAddress } from './workflow-view'

describe("a workflow page's address", () => {
  it('names a version other than the latest, which the page shows by itself', () => {
    expect(versionAddress('w-1', 2, 4)).toEqual({ kind: 'record', resource: 'workflows', key: 'w-1', version: 2 })
    expect(versionAddress('w-1', 4, 4)).toEqual({ kind: 'record', resource: 'workflows', key: 'w-1' })
  })

  it('names a run with the version it ran on, the latest too, and closing it keeps an older version', () => {
    expect(runAddress('w-1', 'r-9', 4)).toEqual({ kind: 'record', resource: 'workflows', key: 'w-1', version: 4, run: 'r-9' })
    expect(closedRunAddress({ workflow: 'w-1', version: 4, run: 'r-9' }, 4)).toEqual({ kind: 'record', resource: 'workflows', key: 'w-1' })
    expect(closedRunAddress({ workflow: 'w-1', version: 2, run: 'r-9' }, 4)).toEqual({ kind: 'record', resource: 'workflows', key: 'w-1', version: 2 })
  })
})
