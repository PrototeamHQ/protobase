import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { androidSigning, dropAndroidSigning, withoutAndroidSigning, withReleaseSigning } from './android-signing'

let dir = ''
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const project = () => {
  dir = mkdtempSync(path.join(tmpdir(), 'protobase-android-signing-'))
  writeFileSync(path.join(dir, 'upload.jks'), '')
  return dir
}

const signing = { PROTOBASE_ANDROID_KEYSTORE: 'upload.jks', PROTOBASE_ANDROID_KEYSTORE_PASSWORD: 'store-pw', PROTOBASE_ANDROID_KEY_ALIAS: 'upload', PROTOBASE_ANDROID_KEY_PASSWORD: 'key-pw' }

describe('androidSigning', () => {
  it('gives the four variables, the keystore made absolute against the project', () => {
    const dir = project()
    expect(androidSigning({ ...signing, OTHER: 'x' }, dir)).toEqual({ env: { ...signing, PROTOBASE_ANDROID_KEYSTORE: path.join(dir, 'upload.jks') } })
  })

  it('names every variable that is missing or empty in one error, and no value', () => {
    const run = () => androidSigning({ PROTOBASE_ANDROID_KEYSTORE: 'upload.jks', PROTOBASE_ANDROID_KEYSTORE_PASSWORD: 'store-pw', PROTOBASE_ANDROID_KEY_PASSWORD: '' }, project())
    expect(run).toThrow('set PROTOBASE_ANDROID_KEY_ALIAS, PROTOBASE_ANDROID_KEY_PASSWORD')
    expect(run).not.toThrow('store-pw')
  })

  it('refuses a keystore that is not a file', () => {
    const dir = project()
    expect(() => androidSigning({ ...signing, PROTOBASE_ANDROID_KEYSTORE: 'missing.jks' }, dir)).toThrow(`names ${path.join(dir, 'missing.jks')}, which is not a file`)
    expect(() => androidSigning({ ...signing, PROTOBASE_ANDROID_KEYSTORE: '.' }, dir)).toThrow('which is not a file')
  })
})

describe('withoutAndroidSigning', () => {
  it('drops the four variables in any letter case and keeps the rest', () => {
    expect(withoutAndroidSigning({ ...signing, Protobase_Android_Key_Password: 'key-pw', protobase_android_keystore: 'x', PATH: '/bin' })).toEqual({ PATH: '/bin' })
  })
})

describe('dropAndroidSigning', () => {
  it('deletes every name starting with PROTOBASE_ANDROID_ in any letter case, in place, and keeps the rest', () => {
    const env: NodeJS.ProcessEnv = {
      PROTOBASE_ANDROID_KEY_PASSWORD: 'key-pw',
      protobase_android_key_password: 'key-pw',
      pRoToBaSe_AnDrOiD_kEy_AlIaS: 'upload',
      PROTOBASE_ANDROID_UNKNOWN: 'x',
      X_PROTOBASE_ANDROID_KEY: 'kept',
      OTHER: 'kept',
    }
    dropAndroidSigning(env)
    expect(env).toEqual({ X_PROTOBASE_ANDROID_KEY: 'kept', OTHER: 'kept' })
  })
})

// An excerpt of Capacitor's android template, app/build.gradle.
const gradle = `    defaultConfig {
        versionCode 1
        versionName "1.0"
    }
    buildTypes {
        release {
            minifyEnabled false
        }
    }
`

describe('withReleaseSigning', () => {
  it('signs the release build from the variables, naming them only', () => {
    const signed = withReleaseSigning(gradle)
    expect(signed).toContain("storePassword System.getenv('PROTOBASE_ANDROID_KEYSTORE_PASSWORD')")
    expect(signed).toContain("keyPassword System.getenv('PROTOBASE_ANDROID_KEY_PASSWORD')")
    expect(signed).toContain("storeFile file(System.getenv('PROTOBASE_ANDROID_KEYSTORE'))")
    expect(signed).toContain('    buildTypes {\n        release {\n            signingConfig signingConfigs.release\n            minifyEnabled false\n')
    expect(signed.indexOf('signingConfigs {')).toBeLessThan(signed.indexOf('buildTypes {'))
  })

  it('refuses a file without the template\'s release build type, or signed already', () => {
    expect(() => withReleaseSigning(withReleaseSigning(gradle))).toThrow('the one release build type')
    expect(() => withReleaseSigning(gradle.replace('release', 'debug'))).toThrow('the one release build type')
    expect(() => withReleaseSigning(gradle + gradle)).toThrow('the one release build type')
  })
})
