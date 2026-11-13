import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { templateManifest, writeAndroidTemplate } from './android-template-fixture'
import { generatePlatform } from './generate'
import { writeIosTemplate } from './ios-template-fixture'
import { writeProtobaseIcon, writeTemplateIcon } from './native-icon-fixture'
import { writeProtobaseSplash, writeTemplateSplash } from './native-splash-fixture'

const options = { splash: { light: '#ffffff', dark: '#0f0f11' } }

const plist = '<plist version="1.0">\n<dict>\n</dict>\n</plist>\n'

let ws = ''
afterEach(() => rmSync(ws, { recursive: true, force: true }))

// A `cap add` that writes the template's icon and splash, and its AndroidManifest.xml for Android or SPM Info.plist for iOS.
const cap = (calls: string[][], manifest = templateManifest) => async (args: string[]) => {
  calls.push(args)
  writeProtobaseIcon(ws)
  writeProtobaseSplash(ws)
  writeTemplateIcon(ws, args[1] === 'ios' ? 'ios' : 'android')
  writeTemplateSplash(ws, args[1] === 'ios' ? 'ios' : 'android')
  if (args[1] !== 'ios') return writeAndroidTemplate(ws, manifest)
  writeIosTemplate(ws)
  writeFileSync(path.join(ws, 'ios', 'App', 'App', 'Info.plist'), plist)
}
const infoPlist = () => readFileSync(path.join(ws, 'ios', 'App', 'App', 'Info.plist'), 'utf8')
const manifest = () => readFileSync(path.join(ws, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8')
const rules = () => path.join(ws, 'android', 'app', 'src', 'main', 'res', 'xml', 'data_extraction_rules.xml')

describe('generatePlatform', () => {
  it('replaces the native project, leaving iOS transport security alone for an https API', async () => {
    ws = mkdtempSync(path.join(tmpdir(), 'protobase-generate-'))
    mkdirSync(path.join(ws, 'ios'))
    writeFileSync(path.join(ws, 'ios', 'edited.swift'), '')
    const calls: string[][] = []
    await generatePlatform(ws, 'ios', { ...options, cleartext: false }, cap(calls))
    expect(calls).toEqual([['add', 'ios']])
    expect(existsSync(path.join(ws, 'ios', 'edited.swift'))).toBe(false)
    expect(infoPlist()).toBe(plist)
  })

  it('makes every iOS app prepare a fresh install at launch, with push and without', async () => {
    ws = mkdtempSync(path.join(tmpdir(), 'protobase-generate-'))
    const delegate = () => readFileSync(path.join(ws, 'ios', 'App', 'App', 'AppDelegate.swift'), 'utf8')
    await generatePlatform(ws, 'ios', { ...options, cleartext: false }, cap([]))
    expect(delegate()).toContain('ProtobaseFreshInstall.prepare()')
    await generatePlatform(ws, 'ios', { ...options, cleartext: true, apnsEnvironment: 'production' }, cap([]))
    expect(delegate()).toContain('ProtobaseFreshInstall.prepare()')
    expect(delegate()).toContain('capacitorDidRegisterForRemoteNotifications')
  })

  it('allows only local networking on iOS for a plain http API', async () => {
    ws = mkdtempSync(path.join(tmpdir(), 'protobase-generate-'))
    await generatePlatform(ws, 'ios', { ...options, cleartext: true }, cap([]))
    expect(infoPlist()).toContain('<key>NSAllowsLocalNetworking</key>')
    expect(infoPlist()).not.toContain('NSAllowsArbitraryLoads')
  })

  it('sets up push on iOS in the APNs environment it is given for, and leaves it out without one', async () => {
    ws = mkdtempSync(path.join(tmpdir(), 'protobase-generate-'))
    const entitlements = path.join(ws, 'ios', 'App', 'App', 'App.entitlements')
    await generatePlatform(ws, 'ios', { ...options, cleartext: false, apnsEnvironment: 'sandbox' }, cap([]))
    expect(readFileSync(entitlements, 'utf8')).toContain('<string>development</string>')
    expect(readFileSync(path.join(ws, 'ios', 'App', 'App', 'AppDelegate.swift'), 'utf8')).toContain('capacitorDidRegisterForRemoteNotifications')
    await generatePlatform(ws, 'ios', { ...options, cleartext: false }, cap([]))
    expect(existsSync(entitlements)).toBe(false)
    expect(readFileSync(path.join(ws, 'ios', 'App', 'App.xcodeproj', 'project.pbxproj'), 'utf8')).not.toContain('CODE_SIGN_ENTITLEMENTS')
    expect(readFileSync(path.join(ws, 'ios', 'App', 'App', 'AppDelegate.swift'), 'utf8')).not.toContain('RemoteNotifications')
  })

  it('copies the project\'s google-services.json into the Android app it is given for, on every run', async () => {
    ws = mkdtempSync(path.join(tmpdir(), 'protobase-generate-'))
    const projectDir = path.join(ws, 'project')
    mkdirSync(projectDir)
    writeFileSync(path.join(projectDir, 'google-services.json'), '{"project_info":{}}')
    for (let run = 0; run < 2; run++) {
      await generatePlatform(ws, 'android', { ...options, cleartext: false, googleServicesFrom: projectDir }, cap([]))
      expect(readFileSync(path.join(ws, 'android', 'app', 'google-services.json'), 'utf8')).toBe('{"project_info":{}}')
    }
    await generatePlatform(ws, 'android', { ...options, cleartext: false }, cap([]))
    expect(existsSync(path.join(ws, 'android', 'app', 'google-services.json'))).toBe(false)
  })

  it('opts the Android app out of backup and device transfer on every run, and leaves iOS without either', async () => {
    ws = mkdtempSync(path.join(tmpdir(), 'protobase-generate-'))
    const calls: string[][] = []
    for (let run = 0; run < 2; run++) {
      await generatePlatform(ws, 'android', { ...options, cleartext: true }, cap(calls))
      expect(manifest()).toContain('android:allowBackup="false"')
      expect(manifest()).toContain('tools:replace="android:allowBackup,android:dataExtractionRules"')
      expect(readFileSync(rules(), 'utf8')).toContain('<device-transfer>')
    }
    expect(calls).toEqual([['add', 'android'], ['add', 'android']])
    await generatePlatform(ws, 'ios', { ...options, cleartext: false }, cap([]))
    expect(existsSync(path.join(ws, 'ios', 'App', 'App', 'res'))).toBe(false)
    expect(infoPlist()).toBe(plist)
  })

  it("gives both platforms Protobase's splash on the app's background in place of Capacitor's", async () => {
    ws = mkdtempSync(path.join(tmpdir(), 'protobase-generate-'))
    await generatePlatform(ws, 'ios', { cleartext: false, splash: { light: '#f4f3ee', dark: '#111216' } }, cap([]))
    expect(readFileSync(path.join(ws, 'ios', 'App', 'App', 'Base.lproj', 'LaunchScreen.storyboard'), 'utf8')).toBe('protobase')
    expect(readFileSync(path.join(ws, 'ios', 'App', 'App', 'Assets.xcassets', 'SplashBackground.colorset', 'Contents.json'), 'utf8')).toContain('"red": "0xF4"')
    await generatePlatform(ws, 'android', { cleartext: false, splash: { light: '#f4f3ee', dark: '#111216' } }, cap([]))
    const res = path.join(ws, 'android', 'app', 'src', 'main', 'res')
    expect(readFileSync(path.join(res, 'values', 'styles.xml'), 'utf8')).toContain('@color/protobase_splash_background')
    expect(readFileSync(path.join(res, 'values-night', 'protobase_splash.xml'), 'utf8')).toContain('#111216')
    expect(existsSync(path.join(res, 'drawable', 'splash.png'))).toBe(false)
  })

  it('fails, writing no rules, when cap add writes an Android manifest that is not the template', async () => {
    ws = mkdtempSync(path.join(tmpdir(), 'protobase-generate-'))
    await expect(generatePlatform(ws, 'android', { ...options, cleartext: false }, cap([], templateManifest.replace('android:allowBackup="true"', 'android:allowBackup="false"'))))
      .rejects.toThrow('AndroidManifest.xml is not Capacitor\'s template')
    expect(existsSync(rules())).toBe(false)
  })
})
