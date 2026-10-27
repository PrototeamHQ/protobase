import { describe, expect, it } from 'vitest'
import { caretRange, presetPackage, presetTsconfig } from './preset-package'

describe('presetPackage', () => {
  it('pins every workspace dependency to the range and lists the @protobase packages in devDependencies, bundled', () => {
    const source = {
      name: 'erp',
      scripts: { test: 'vitest run' },
      dependencies: { '@protobase/server': 'workspace:*', kysely: '^0.29.6', '@protobase/cli': 'workspace:*' },
      devDependencies: { vitest: '^5.0.3', '@protobase/schema': 'workspace:*' },
    }
    const preset = presetPackage(source, '^0.2.0')
    expect(preset).toEqual({
      name: 'erp',
      scripts: { test: 'vitest run' },
      dependencies: { kysely: '^0.29.6' },
      devDependencies: { '@protobase/cli': '^0.2.0', '@protobase/schema': '^0.2.0', '@protobase/server': '^0.2.0', vitest: '^5.0.3' },
    })
    expect(Object.keys(preset.devDependencies!)).toEqual(['@protobase/cli', '@protobase/schema', '@protobase/server', 'vitest'])
  })

  it('leaves out dependencies when only @protobase packages were in it', () => {
    expect(presetPackage({ dependencies: { '@protobase/server': 'workspace:*' } }, '^0.2.0')).toEqual({ devDependencies: { '@protobase/server': '^0.2.0' } })
  })

  it('leaves a package without dependencies as it is', () => {
    expect(presetPackage({ name: 'scratch' }, '0.2.0')).toEqual({ name: 'scratch' })
  })

  it('refuses a workspace range other than workspace:*', () => {
    expect(() => presetPackage({ dependencies: { '@protobase/ui': 'workspace:^' } }, '0.2.0')).toThrow('@protobase/ui')
  })
})

describe('caretRange', () => {
  it('is the caret range of the version, below 1.0 too', () => {
    expect(caretRange('0.13.4')).toBe('^0.13.4')
    expect(caretRange('1.2.3')).toBe('^1.2.3')
    expect(caretRange('2.0.0-rc.1')).toBe('^2.0.0-rc.1')
  })

  it('refuses what is not a version', () => {
    expect(() => caretRange('latest')).toThrow('latest')
  })
})

describe('presetTsconfig', () => {
  it("extends what protobase types writes, ahead of the example's own options", () => {
    const preset = presetTsconfig({ compilerOptions: { strict: true }, exclude: ['dist'] })
    expect(preset).toEqual({ extends: './.protobase/tsconfig.json', compilerOptions: { strict: true }, exclude: ['dist'] })
    expect(Object.keys(preset)[0]).toBe('extends')
  })
})
