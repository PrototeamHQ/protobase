import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { setUpIosPush, pushEntitlements, withPushEntitlements, withTokenForwarding } from './ios-push'
import { templateAppDelegate, templatePbxproj, writeIosTemplate } from './ios-template-fixture'

let ws = ''
afterEach(() => rmSync(ws, { recursive: true, force: true }))

describe('pushEntitlements', () => {
  it('names the development APNs environment for the sandbox and production for a release', () => {
    expect(pushEntitlements('sandbox')).toContain('<key>aps-environment</key>\n\t<string>development</string>')
    expect(pushEntitlements('production')).toContain('<key>aps-environment</key>\n\t<string>production</string>')
  })
})

describe('withPushEntitlements', () => {
  it('signs the Debug and Release configurations with the entitlements file', () => {
    const changed = withPushEntitlements(templatePbxproj)
    expect(changed.match(/CODE_SIGN_ENTITLEMENTS = App\/App.entitlements;\n\t\t\t\tINFOPLIST_FILE = App\/Info.plist;/g)).toHaveLength(2)
    expect(() => withPushEntitlements(changed)).toThrow('already names entitlements')
  })

  it('fails when the template no longer has its configurations as it did', () => {
    expect(() => withPushEntitlements(templatePbxproj.replace('INFOPLIST_FILE = App/Info.plist;', 'INFOPLIST_FILE = Info.plist;'))).toThrow(
      "project.pbxproj has `INFOPLIST_FILE = App/Info.plist;` 1 times, not 2 as in Capacitor's template: iOS push cannot be set up",
    )
  })
})

describe('withTokenForwarding', () => {
  it("forwards the APNs token and its failure to Capacitor's push plugin, inside the AppDelegate class", () => {
    const changed = withTokenForwarding(templateAppDelegate)
    expect(changed).toContain('NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)')
    expect(changed).toContain('NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)')
    expect(changed.indexOf('didRegisterForRemoteNotificationsWithDeviceToken')).toBeGreaterThan(changed.indexOf('func applicationWillTerminate'))
    expect(changed.indexOf('didRegisterForRemoteNotificationsWithDeviceToken')).toBeLessThan(changed.indexOf('configurationForConnecting'))
    expect(() => withTokenForwarding(changed)).toThrow('already handles the APNs token')
  })

  it('fails with a clear error when the template lacks the anchor it inserts at', () => {
    const moved = templateAppDelegate.replace('configurationForConnecting', 'configurationFor')
    expect(() => withTokenForwarding(moved)).toThrow("AppDelegate.swift has `func application(_ application: UIApplication,` 0 times, not 1 as in Capacitor's template: iOS push cannot be set up")
  })
})

describe('setUpIosPush', () => {
  it('writes the entitlement and edits the project and AppDelegate in the workspace', async () => {
    ws = mkdtempSync(path.join(tmpdir(), 'protobase-ios-push-'))
    writeIosTemplate(ws)
    await setUpIosPush(ws, 'production')
    const app = path.join(ws, 'ios', 'App')
    expect(readFileSync(path.join(app, 'App', 'App.entitlements'), 'utf8')).toBe(pushEntitlements('production'))
    expect(readFileSync(path.join(app, 'App.xcodeproj', 'project.pbxproj'), 'utf8')).toContain('CODE_SIGN_ENTITLEMENTS = App/App.entitlements;')
    expect(readFileSync(path.join(app, 'App', 'AppDelegate.swift'), 'utf8')).toContain('capacitorDidRegisterForRemoteNotifications')
  })
})
