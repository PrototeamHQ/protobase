import { describe, expect, it } from 'vitest'
import { hostPackages } from './host-packages'

describe('hostPackages', () => {
  it('holds the @protobase packages and their dependencies, not the dev dependencies', () => {
    for (const name of ['@protobase/cli', '@protobase/schema', '@protobase/server', '@protobase/ui', '@protobase/client', 'pg', 'postgres', 'kysely', 'better-auth', 'zod', 'react', '@dnd-kit/core']) expect(hostPackages.has(name)).toBe(true)
    for (const name of ['vitest', 'typescript', '@commitlint/cli']) expect(hostPackages.has(name)).toBe(false)
    // A dependency of @protobase/server it loads on demand, which a config inlines.
    expect(hostPackages.has('react-email')).toBe(false)
  })
})
