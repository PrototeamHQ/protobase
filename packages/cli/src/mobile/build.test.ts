import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { androidSigningVariables } from './android-signing'
import { mobileBuild } from './build'
import type { ChildOptions } from './child-process'
import { nativeDependencies } from './pinned-packages'
import { protobasePluginClasses } from './protobase-plugin'

const storePassword = 'store-pw-5f1c'
const keyPassword = 'key-pw-9a2e'
const signing = { PROTOBASE_ANDROID_KEYSTORE: 'keys/upload.jks', PROTOBASE_ANDROID_KEYSTORE_PASSWORD: storePassword, PROTOBASE_ANDROID_KEY_ALIAS: 'upload', PROTOBASE_ANDROID_KEY_PASSWORD: keyPassword }

let root = ''
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  for (const key of [...androidSigningVariables, 'Protobase_Android_Key_Password', 'OWN_SECRET']) delete process.env[key]
})

// A project with a keystore and an .env.local that sets the signing variables and a secret of its own.
const project = (config = "{ mobile: { appId: 'com.example.shop' } }") => {
  root = mkdtempSync(path.join(tmpdir(), 'protobase-mobile-build-'))
  const dir = path.join(root, 'shop')
  mkdirSync(path.join(dir, 'keys'), { recursive: true })
  writeFileSync(path.join(dir, 'keys', 'upload.jks'), '')
  writeFileSync(path.join(dir, 'protobase.config.ts'), `export default ${config}\n`)
  writeFileSync(path.join(dir, '.env.local'), `${Object.entries(signing).map(([key, value]) => `${key}=${value}`).join('\n')}\nOWN_SECRET=own\n`)
  Object.assign(process.env, signing, { OWN_SECRET: 'own' })
  return dir
}

const write = (file: string, content = '') => {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, content)
}

// Excerpts of what `cap add` writes, holding every anchor the release edits need.
const gradle = '    defaultConfig {\n        versionCode 1\n        versionName "1.0"\n    }\n    buildTypes {\n        release {\n            minifyEnabled false\n        }\n    }\n'
const configuration = '\t\t\t\tCURRENT_PROJECT_VERSION = 1;\n\t\t\t\tMARKETING_VERSION = 1.0;\n'
const pbxproj = `/* End PBXBuildFile section */
/* End PBXFileReference section */
				50379B222058CBB4000EE86E /* capacitor.config.json */,
				50379B232058CBB4000EE86E /* capacitor.config.json in Resources */,
${configuration}${configuration}`

type Call = { command: string; args: string[] } & ChildOptions

// npm, Capacitor and Gradle as they leave the workspace, recording every call; `gradle` says what Gradle does.
const fakeRun = (calls: Call[], gradleOutcome: 'bundle' | 'nothing' | 'fail' = 'bundle') => async (command: string, args: string[], options: ChildOptions) => {
  calls.push({ command, args, ...options })
  const ws = options.cwd
  if (command === 'npm') {
    write(path.join(ws, 'node_modules/@protobase/mobile/package.json'), JSON.stringify({ name: '@protobase/mobile', version: '0.14.2' }))
    for (const [name, version] of Object.entries(nativeDependencies)) write(path.join(ws, 'node_modules', name, 'package.json'), JSON.stringify({ name, version }))
    write(path.join(ws, 'node_modules/@capacitor/cli/package.json'), JSON.stringify({ name: '@capacitor/cli', version: nativeDependencies['@capacitor/cli'], bin: { cap: './bin/capacitor' } }))
  }
  if (command === 'node' && args[1] === 'add') {
    if (args[2] === 'android') {
      write(path.join(ws, 'android/app/build.gradle'), gradle)
      write(path.join(ws, 'android/app/src/main/assets/capacitor.plugins.json'), JSON.stringify(protobasePluginClasses.map((classpath) => ({ pkg: '@protobase/mobile', classpath }))))
    } else {
      write(path.join(ws, 'ios/App/App.xcodeproj/project.pbxproj'), pbxproj)
      write(path.join(ws, 'ios/App/App/Info.plist'), '<plist version="1.0">\n<dict>\n</dict>\n</plist>\n')
      write(path.join(ws, 'ios/App/App/capacitor.config.json'), JSON.stringify({ packageClassList: ['AppPlugin'] }))
    }
  }
  if (command === 'node' && args[1] === 'build') write(path.join(ws, 'ios/App/output/App.ipa'), 'ipa')
  if (command.endsWith('gradlew')) {
    if (gradleOutcome === 'fail') throw new Error('gradlew exited with status 1')
    if (gradleOutcome === 'bundle') write(path.join(ws, 'app/build/outputs/bundle/release/app-release.aab'), 'aab')
  }
}

const webBuild = async ({ outDir }: { outDir: string }) => write(path.join(outDir, 'public', 'index.html'), '<head></head>')

const version = { version: '1.2.3', build: '7' }
const input = (dir: string, platform: 'android' | 'ios', more = {}) => ({ projectDir: dir, platform, extensions: [], api: 'https://api.example.com', version, outDir: path.join(dir, 'mobile-release'), ...more })
const ws = (dir: string) => path.join(dir, '.protobase', 'mobile')
const short = ({ command, args }: Call) => [command, ...args.slice(command === 'node' ? 1 : 0)]

describe('mobileBuild android', () => {
  it('signs through Gradle alone, which is the only child given the upload key, and copies the bundle out', async () => {
    const dir = project()
    process.env.Protobase_Android_Key_Password = keyPassword
    const calls: Call[] = []
    const out: string[] = []
    await mobileBuild(input(dir, 'android'), (text) => void out.push(text), { run: fakeRun(calls), build: webBuild })
    const gradlew = path.join(ws(dir), 'android', 'gradlew')
    expect(calls.map(short)).toEqual([
      ['npm', 'install', '--install-links', '--no-audit', '--no-fund'],
      ['node', 'add', 'android'],
      [gradlew, ':app:bundleRelease', '--no-daemon', '--no-configuration-cache', '-Pkotlin.compiler.execution.strategy=in-process'],
    ])
    const [npm, cap, gradle] = calls as [Call, Call, Call]
    for (const { env } of [npm, cap]) {
      for (const key of Object.keys(env)) expect(key.toUpperCase()).not.toMatch(/^PROTOBASE_ANDROID_/)
      expect(env).not.toHaveProperty('OWN_SECRET')
    }
    // Gradle's environment is exactly the others' plus the four variables, the keystore absolute.
    expect(gradle.env).toEqual({ ...npm.env, ...signing, PROTOBASE_ANDROID_KEYSTORE: path.join(dir, 'keys', 'upload.jks') })
    expect(gradle.cwd).toBe(path.join(ws(dir), 'android'))
    for (const { args } of calls) expect(args.join(' ')).not.toMatch(new RegExp(`${storePassword}|${keyPassword}`))

    const release = path.join(dir, 'mobile-release', 'com.example.shop-1.2.3-7.aab')
    expect(readFileSync(release, 'utf8')).toBe('aab')
    expect(out.join('')).toContain('release mobile-release/com.example.shop-1.2.3-7.aab\n')
    expect(out.join('')).not.toMatch(new RegExp(`${storePassword}|${keyPassword}`))
    const buildGradle = readFileSync(path.join(ws(dir), 'android/app/build.gradle'), 'utf8')
    expect(buildGradle).toContain('        versionCode 7\n        versionName "1.2.3"\n')
    expect(buildGradle).toContain('signingConfig signingConfigs.release')
    expect(buildGradle).not.toMatch(new RegExp(`${storePassword}|${keyPassword}`))
  })

  it('writes a config with no plain transport, no inspection and no build options', async () => {
    const dir = project()
    await mobileBuild(input(dir, 'android'), () => {}, { run: fakeRun([]), build: webBuild })
    const config = JSON.parse(readFileSync(path.join(ws(dir), 'capacitor.config.json'), 'utf8'))
    expect(Object.keys(config).sort()).toEqual(['android', 'appId', 'appName', 'appendUserAgent', 'includePlugins', 'plugins', 'webDir'])
  })

  it('refuses a missing variable, and a server that is not https away from this machine, before npm runs', async () => {
    const dir = project("{ mobile: { appId: 'com.example.shop' }, auth: { issuer: 'http://api.example.com' } }")
    const calls: Call[] = []
    const deps = { run: fakeRun(calls), build: webBuild }
    delete process.env.PROTOBASE_ANDROID_KEY_ALIAS
    const missing = mobileBuild(input(dir, 'android'), () => {}, deps)
    await expect(missing).rejects.toThrow('set PROTOBASE_ANDROID_KEY_ALIAS')
    await expect(missing).rejects.not.toThrow(storePassword)
    process.env.PROTOBASE_ANDROID_KEY_ALIAS = 'upload'
    for (const api of ['http://localhost:3000', 'https://10.0.2.2', 'https://localhost:3000']) {
      await expect(mobileBuild(input(dir, 'android', { api }), () => {}, deps), api).rejects.toThrow('A release build calls its server over https')
    }
    await expect(mobileBuild(input(dir, 'android', { api: 'https://user:pw@api.example.com' }), () => {}, deps)).rejects.toThrow('without a user')
    expect(calls).toEqual([])
  })

  it('ships nothing when Gradle fails or leaves no bundle', async () => {
    for (const outcome of ['fail', 'nothing'] as const) {
      const dir = project()
      const out: string[] = []
      await expect(mobileBuild(input(dir, 'android'), (text) => void out.push(text), { run: fakeRun([], outcome), build: webBuild })).rejects.toThrow()
      expect(existsSync(path.join(dir, 'mobile-release')) && readdirSync(path.join(dir, 'mobile-release')).some((name) => name.endsWith('.aab'))).toBe(false)
      expect(out.join('')).not.toContain('release ')
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('mobileBuild ios', () => {
  it('builds with Capacitor and the team, giving no child the Android upload key, and copies the ipa out', async () => {
    const dir = project()
    const calls: Call[] = []
    await mobileBuild(input(dir, 'ios', { ios: { team: 'ABCDE12345' } }), () => {}, { run: fakeRun(calls), build: webBuild })
    expect(calls.map(short)).toEqual([
      ['npm', 'install', '--install-links', '--no-audit', '--no-fund'],
      ['node', 'add', 'ios'],
      ['node', 'build', 'ios', '--xcode-team-id', 'ABCDE12345'],
    ])
    for (const { env } of calls) for (const key of Object.keys(env)) expect(key.toUpperCase()).not.toMatch(/^PROTOBASE_ANDROID_/)
    expect(readFileSync(path.join(dir, 'mobile-release', 'com.example.shop-1.2.3-7.ipa'), 'utf8')).toBe('ipa')
    const project_ = readFileSync(path.join(ws(dir), 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8')
    expect(project_).toContain('PrivacyInfo.xcprivacy in Resources')
    expect(project_.match(/CURRENT_PROJECT_VERSION = 7;/g)).toHaveLength(2)
    expect(project_.match(/MARKETING_VERSION = 1\.2\.3;/g)).toHaveLength(2)
    expect(readFileSync(path.join(ws(dir), 'ios/App/App/PrivacyInfo.xcprivacy'), 'utf8')).toContain('CA92.1')
    expect(readFileSync(path.join(ws(dir), 'ios/App/App/Info.plist'), 'utf8')).not.toContain('NSAppTransportSecurity')
    const config = JSON.parse(readFileSync(path.join(ws(dir), 'capacitor.config.json'), 'utf8'))
    expect(Object.keys(config).sort()).toEqual(['android', 'appId', 'appName', 'appendUserAgent', 'includePlugins', 'plugins', 'webDir'])
  })

  it('passes manual signing to Capacitor', async () => {
    const dir = project()
    const calls: Call[] = []
    await mobileBuild(input(dir, 'ios', { ios: { team: 'ABCDE12345', manual: { certificate: 'Apple Distribution', profile: 'Shop App Store' } } }), () => {}, { run: fakeRun(calls), build: webBuild })
    expect(short(calls[2] as Call)).toEqual(['node', 'build', 'ios', '--xcode-team-id', 'ABCDE12345', '--xcode-signing-style', 'manual', '--xcode-signing-certificate', 'Apple Distribution', '--xcode-provisioning-profile', 'Shop App Store'])
  })

  it('refuses a release without a team or an https server before npm runs', async () => {
    const dir = project("{ mobile: { appId: 'com.example.shop' }, auth: { issuer: 'https://localhost:3000' } }")
    const calls: Call[] = []
    const deps = { run: fakeRun(calls), build: webBuild }
    await expect(mobileBuild(input(dir, 'ios'), () => {}, deps)).rejects.toThrow('pass --team')
    const { api: _, ...noApi } = input(dir, 'ios', { ios: { team: 'ABCDE12345' } })
    await expect(mobileBuild(noApi, () => {}, deps)).rejects.toThrow('A release build calls its server over https')
    expect(calls).toEqual([])
  })
})
