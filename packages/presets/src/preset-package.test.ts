import { describe, expect, it } from 'vitest'
import { presetPackage } from './preset-package'

describe('presetPackage', () => {
  it('pins every workspace dependency to the release version and keeps the rest', () => {
    const source = {
      name: 'erp',
      scripts: { test: 'vitest run' },
      dependencies: { '@protobase/cli': 'workspace:*', kysely: '^0.29.6' },
      devDependencies: { '@protobase/schema': 'workspace:*', vitest: '^5.0.3' },
    }
    expect(presetPackage(source, '0.2.0')).toEqual({
      name: 'erp',
      scripts: { test: 'vitest run' },
      dependencies: { '@protobase/cli': '0.2.0', kysely: '^0.29.6' },
      devDependencies: { '@protobase/schema': '0.2.0', vitest: '^5.0.3' },
    })
  })

  it('leaves a package without dependencies as it is', () => {
    expect(presetPackage({ name: 'scratch' }, '0.2.0')).toEqual({ name: 'scratch' })
  })

  it('refuses a workspace range other than workspace:*', () => {
    expect(() => presetPackage({ dependencies: { '@protobase/ui': 'workspace:^' } }, '0.2.0')).toThrow('@protobase/ui')
  })
})
