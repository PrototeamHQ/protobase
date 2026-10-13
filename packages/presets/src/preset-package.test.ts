import { describe, expect, it } from 'vitest'
import { majorRange, presetPackage } from './preset-package'

describe('presetPackage', () => {
  it('pins every workspace dependency to the range and keeps the rest', () => {
    const source = {
      name: 'erp',
      scripts: { test: 'vitest run' },
      dependencies: { '@protobase/cli': 'workspace:*', kysely: '^0.29.6' },
      devDependencies: { '@protobase/schema': 'workspace:*', vitest: '^5.0.3' },
    }
    expect(presetPackage(source, '>=0.2.0 <1')).toEqual({
      name: 'erp',
      scripts: { test: 'vitest run' },
      dependencies: { '@protobase/cli': '>=0.2.0 <1', kysely: '^0.29.6' },
      devDependencies: { '@protobase/schema': '>=0.2.0 <1', vitest: '^5.0.3' },
    })
  })

  it('leaves a package without dependencies as it is', () => {
    expect(presetPackage({ name: 'scratch' }, '0.2.0')).toEqual({ name: 'scratch' })
  })

  it('refuses a workspace range other than workspace:*', () => {
    expect(() => presetPackage({ dependencies: { '@protobase/ui': 'workspace:^' } }, '0.2.0')).toThrow('@protobase/ui')
  })
})

describe('majorRange', () => {
  it('spans the rest of major 0 below 1.0, where a caret range would stop at the minor', () => {
    expect(majorRange('0.13.4')).toBe('>=0.13.4 <1')
  })

  it('is a caret range from 1.0 on', () => {
    expect(majorRange('1.2.3')).toBe('^1.2.3')
    expect(majorRange('2.0.0-rc.1')).toBe('^2.0.0-rc.1')
  })

  it('refuses what is not a version', () => {
    expect(() => majorRange('latest')).toThrow('latest')
  })
})
