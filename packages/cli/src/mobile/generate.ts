import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { dataExtractionRules, dataExtractionRulesPath, withoutBackup } from './android-backup'
import type { RunCapacitor } from './capacitor'
import { copyGoogleServices } from './google-services'
import { withLocalNetworking } from './info-plist'
import { withFreshInstall } from './ios-fresh-install'
import { type ApnsEnvironment, setUpIosPush } from './ios-push'
import { withProtobaseIcon } from './native-icon'
import type { Platform } from './platform'

// The SPM template's Info.plist, which `cap add ios` writes.
const infoPlist = (ws: string) => path.join(ws, 'ios', 'App', 'App', 'Info.plist')

// The template's AppDelegate.swift.
const appDelegate = (ws: string) => path.join(ws, 'ios', 'App', 'App', 'AppDelegate.swift')

// The template's AndroidManifest.xml, which `cap add android` writes and never rewrites.
const androidManifest = (ws: string) => path.join(ws, 'android', 'app', 'src', 'main', 'AndroidManifest.xml')

/**
 * Generates the platform's native project in the workspace from its capacitor.config.json and app files, replacing
 * the last one: it is never edited by hand. Its home-screen icon is Protobase's, an Android app with push gets the
 * project's google-services.json from `googleServicesFrom`, an iOS app with push its entitlement in `apnsEnvironment` and
 * the token forwarding, and an iOS app calling the API over plain http may reach local addresses. Android apps opt out
 * of backup and device transfer, and iOS apps start as a fresh install after a restore or a move, so nothing carries
 * over to another phone.
 */
export const generatePlatform = async (
  ws: string,
  platform: Platform,
  { cleartext, googleServicesFrom, apnsEnvironment }: { cleartext: boolean; googleServicesFrom?: string; apnsEnvironment?: ApnsEnvironment },
  cap: RunCapacitor,
) => {
  await rm(path.join(ws, platform), { recursive: true, force: true })
  await cap(['add', platform])
  await withProtobaseIcon(ws, platform)
  if (platform === 'android') {
    if (googleServicesFrom !== undefined) await copyGoogleServices(googleServicesFrom, ws)
    await writeFile(androidManifest(ws), withoutBackup(await readFile(androidManifest(ws), 'utf8')))
    const rules = path.join(ws, 'android', ...dataExtractionRulesPath)
    await mkdir(path.dirname(rules), { recursive: true })
    await writeFile(rules, dataExtractionRules)
    return
  }
  await writeFile(appDelegate(ws), withFreshInstall(await readFile(appDelegate(ws), 'utf8')))
  if (apnsEnvironment !== undefined) await setUpIosPush(ws, apnsEnvironment)
  if (!cleartext) return
  await writeFile(infoPlist(ws), withLocalNetworking(await readFile(infoPlist(ws), 'utf8')))
}
