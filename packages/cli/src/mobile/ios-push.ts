import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

/** The APNs environment an iOS build registers its token in: the sandbox for development builds, production for a store release. */
export type ApnsEnvironment = 'sandbox' | 'production'

/** Where the push entitlement goes in the generated iOS project, from `ios/App/`, as the target's build settings name it. */
export const entitlementsPath = 'App/App.entitlements'

/** The app's entitlements: push, in the APNs environment it registers in, which the entitlement calls `development` for the sandbox. */
export const pushEntitlements = (environment: ApnsEnvironment) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>aps-environment</key>
	<string>${environment === 'sandbox' ? 'development' : 'production'}</string>
</dict>
</plist>
`

// The anchor of each edit, how often Capacitor's SPM template has it, and what goes before it.
const infoPlistSetting = '\t\t\t\tINFOPLIST_FILE = App/Info.plist;\n'
const delegateEnd = '\n    func application(_ application: UIApplication,\n                     configurationForConnecting'

// The two methods Capacitor's push plugin needs to hear of the APNs token, as its documentation gives them.
const tokenForwarding = `
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }
`

const insertBefore = (text: string, file: string, anchor: string, count: number, insert: string) => {
  const parts = text.split(anchor)
  if (parts.length - 1 !== count) throw new Error(`${file} has \`${anchor.trim().split('\n')[0]}\` ${parts.length - 1} times, not ${count} as in Capacitor's template: iOS push cannot be set up`)
  return parts.join(`${insert}${anchor}`)
}

/** The project.pbxproj with the app target's Debug and Release configurations signing with the push entitlement. */
export const withPushEntitlements = (pbxproj: string) => {
  if (pbxproj.includes('CODE_SIGN_ENTITLEMENTS')) throw new Error('project.pbxproj already names entitlements')
  return insertBefore(pbxproj, 'project.pbxproj', infoPlistSetting, 2, `\t\t\t\tCODE_SIGN_ENTITLEMENTS = ${entitlementsPath};\n`)
}

/** The AppDelegate.swift forwarding the APNs token, or the failure to get one, to Capacitor's push plugin. */
export const withTokenForwarding = (delegate: string) => {
  if (delegate.includes('didRegisterForRemoteNotificationsWithDeviceToken')) throw new Error('AppDelegate.swift already handles the APNs token')
  return insertBefore(delegate, 'AppDelegate.swift', delegateEnd, 1, tokenForwarding)
}

const edit = async (file: string, change: (text: string) => string) => writeFile(file, change(await readFile(file, 'utf8')))

/**
 * Gives the iOS project `cap add ios` generated in the workspace `ws` push: the entitlement in `environment`, which the
 * app target signs with, and the token forwarding in its AppDelegate. Each edit is checked against Capacitor's template
 * and fails when it changed, rather than building an app that never gets a token.
 */
export const setUpIosPush = async (ws: string, environment: ApnsEnvironment) => {
  const app = path.join(ws, 'ios', 'App')
  await writeFile(path.join(app, entitlementsPath), pushEntitlements(environment))
  await edit(path.join(app, 'App.xcodeproj', 'project.pbxproj'), withPushEntitlements)
  await edit(path.join(app, 'App', 'AppDelegate.swift'), withTokenForwarding)
}
