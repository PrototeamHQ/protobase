import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { withReleaseSigning } from './android-signing'
import { type AppVersion, withAndroidVersion, withIosVersion } from './app-version'
import type { Platform } from './platform'
import { privacyManifest, privacyManifestPath, withPrivacyManifest } from './privacy-manifest'

const edit = async (file: string, change: (text: string) => string) => writeFile(file, change(await readFile(file, 'utf8')))

/**
 * Makes the native project `cap add` generated in the workspace `ws` a release: the version and build number, and on
 * Android signing from the environment, on iOS the privacy manifest.
 */
export const prepareReleaseProject = async (ws: string, platform: Platform, version: AppVersion) => {
  if (platform === 'android') return edit(path.join(ws, 'android', 'app', 'build.gradle'), (gradle) => withReleaseSigning(withAndroidVersion(gradle, version)))
  await edit(path.join(ws, 'ios', 'App', 'App.xcodeproj', 'project.pbxproj'), (pbxproj) => withPrivacyManifest(withIosVersion(pbxproj, version)))
  await writeFile(path.join(ws, 'ios', ...privacyManifestPath), privacyManifest)
}
