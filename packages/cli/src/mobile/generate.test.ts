import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { generatePlatform } from './generate'
import { writeIosTemplate } from './ios-template-fixture'
import { writeProtobaseIcon, writeTemplateIcon } from './native-icon-fixture'

const plist = '<plist version="1.0">\n<dict>\n</dict>\n</plist>\n'

let ws = ''
afterEach(() => rmSync(ws, { recursive: true, force: true }))

// A `cap add` that writes the template's icon, and the SPM template's Info.plist for iOS.
const cap = (calls: string[][]) => async (args: string[]) => {
  calls.push(args)
  writeProtobaseIcon(ws)
  writeTemplateIcon(ws, args[1] === 'ios' ? 'ios' : 'android')
  if (args[1] !== 'ios') return
  writeIosTemplate(ws)
  writeFileSync(path.join(ws, 'ios', 'App', 'App', 'Info.plist'), plist)
}
const infoPlist = () => readFileSync(path.join(ws, 'ios', 'App', 'App', 'Info.plist'), 'utf8')

describe('generatePlatform', () => {
  it('replaces the native project, leaving iOS transport security alone for an https API', async () => {
    ws = mkdtempSync(path.join(tmpdir(), 'protobase-generate-'))
    mkdirSync(path.join(ws, 'ios'))
    writeFileSync(path.join(ws, 'ios', 'edited.swift'), '')
    const calls: string[][] = []
    await generatePlatform(ws, 'ios', { cleartext: false }, cap(calls))
    expect(calls).toEqual([['add', 'ios']])
    expect(existsSync(path.join(ws, 'ios', 'edited.swift'))).toBe(false)
    expect(infoPlist()).toBe(plist)
  })

  it('allows only local networking on iOS for a plain http API', async () => {
    ws = mkdtempSync(path.join(tmpdir(), 'protobase-generate-'))
    await generatePlatform(ws, 'ios', { cleartext: true }, cap([]))
    expect(infoPlist()).toContain('<key>NSAllowsLocalNetworking</key>')
    expect(infoPlist()).not.toContain('NSAllowsArbitraryLoads')
  })

  it('sets up push on iOS in the APNs environment it is given for, and leaves it out without one', async () => {
    ws = mkdtempSync(path.join(tmpdir(), 'protobase-generate-'))
    const entitlements = path.join(ws, 'ios', 'App', 'App', 'App.entitlements')
    await generatePlatform(ws, 'ios', { cleartext: false, apnsEnvironment: 'sandbox' }, cap([]))
    expect(readFileSync(entitlements, 'utf8')).toContain('<string>development</string>')
    expect(readFileSync(path.join(ws, 'ios', 'App', 'App', 'AppDelegate.swift'), 'utf8')).toContain('capacitorDidRegisterForRemoteNotifications')
    await generatePlatform(ws, 'ios', { cleartext: false }, cap([]))
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
      await generatePlatform(ws, 'android', { cleartext: false, googleServicesFrom: projectDir }, cap([]))
      expect(readFileSync(path.join(ws, 'android', 'app', 'google-services.json'), 'utf8')).toBe('{"project_info":{}}')
    }
    await generatePlatform(ws, 'android', { cleartext: false }, cap([]))
    expect(existsSync(path.join(ws, 'android', 'app', 'google-services.json'))).toBe(false)
  })

  it('changes no plist for Android', async () => {
    ws = mkdtempSync(path.join(tmpdir(), 'protobase-generate-'))
    const calls: string[][] = []
    await generatePlatform(ws, 'android', { cleartext: true }, cap(calls))
    expect(calls).toEqual([['add', 'android']])
  })
})
