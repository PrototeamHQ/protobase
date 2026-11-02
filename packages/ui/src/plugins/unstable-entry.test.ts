import { describe, expect, it } from 'vitest'
import * as stable from '@protobase/ui'
import { Skeleton } from '@protobase/ui/unstable/primitives/skeleton'

describe('@protobase/ui/unstable', () => {
  it('resolves a module the stable entry does not export', () => {
    expect(typeof Skeleton).toBe('function')
    expect(Object.keys(stable)).not.toContain('Skeleton')
  })
})
