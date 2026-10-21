import { describe, expect, it } from 'vitest'
import { withAndroidVersion, withIosVersion } from './app-version'

const version = { version: '1.2.3', build: '7' }

// Excerpts of Capacitor's templates: app/build.gradle and the app target's two configurations in project.pbxproj.
const gradle = '        versionCode 1\n        versionName "1.0"\n'
const configuration = '\t\t\t\tCURRENT_PROJECT_VERSION = 1;\n\t\t\t\tMARKETING_VERSION = 1.0;\n'
const pbxproj = configuration + configuration

describe('withAndroidVersion', () => {
  it('sets versionCode and versionName', () => {
    expect(withAndroidVersion(gradle, version)).toBe('        versionCode 7\n        versionName "1.2.3"\n')
  })

  it('refuses a file whose anchors are not there once each', () => {
    expect(() => withAndroidVersion(gradle + gradle, version)).toThrow('`versionCode 1` 2 times, not 1')
    expect(() => withAndroidVersion('        versionCode 1\n', version)).toThrow('`versionName "1.0"` 0 times, not 1')
  })
})

describe('withIosVersion', () => {
  it('sets both configurations\' build number and version', () => {
    expect(withIosVersion(pbxproj, version)).toBe('\t\t\t\tCURRENT_PROJECT_VERSION = 7;\n\t\t\t\tMARKETING_VERSION = 1.2.3;\n'.repeat(2))
  })

  it('refuses a file whose anchors are not there twice each', () => {
    expect(() => withIosVersion(configuration, version)).toThrow('`CURRENT_PROJECT_VERSION = 1;` 1 times, not 2')
  })
})
