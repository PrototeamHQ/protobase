import { readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { RunCapacitor } from './capacitor'
import { copyGoogleServices } from './google-services'
import { withLocalNetworking } from './info-plist'
import { type ApnsEnvironment, setUpIosPush } from './ios-push'
import { withProtobaseIcon } from './native-icon'
import type { Platform } from './platform'

// The SPM template's Info.plist, which `cap add ios` writes.
const infoPlist = (ws: string) => path.join(ws, 'ios', 'App', 'App', 'Info.plist')

/**
 * Generates the platform's native project in the workspace from its capacitor.config.json and app files, replacing
 * the last one: it is never edited by hand. Its home-screen icon is Protobase's, an Android app with push gets the
 * project's google-services.json from `googleServicesFrom`, an iOS app with push its entitlement in `apnsEnvironment` and
 * the token forwarding, and an iOS app calling the API over plain http may reach local addresses.
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
  if (platform === 'android' && googleServicesFrom !== undefined) await copyGoogleServices(googleServicesFrom, ws)
  if (platform === 'ios' && apnsEnvironment !== undefined) await setUpIosPush(ws, apnsEnvironment)
  if (platform !== 'ios' || !cleartext) return
  await writeFile(infoPlist(ws), withLocalNetworking(await readFile(infoPlist(ws), 'utf8')))
}
