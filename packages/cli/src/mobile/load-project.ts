import { appNameOver } from '@protobase/server'
import { loadSourceConfig } from '../config/source-config'
import { loadNearestEnvFile } from '../dev/env'
import type { Extension } from '../project/extensions'
import { dropAndroidSigning } from './android-signing'

/**
 * What a mobile build needs of the project in `dir`, merged as `protobase dev` merges it after the configs of
 * `extensions`: its mobile section, unchecked, whether it has `notifications()`, its `backgroundColor`, and with sign-in
 * on the app's URL, its tokens' issuer, and its name.
 * The project's .env is loaded first, as other commands do, and no `PROTOBASE_ANDROID_*` variable is left in the
 * environment; nothing but the configs runs. A config function is called with `command: 'build'`, as for the deploy bundle
 * the app's files come from, so the binary's fingerprint and that bundle's manifest name the same `notifications()`.
 */
export const loadMobileProject = async (dir: string, extensions: Extension[]) => {
  loadNearestEnvFile(dir)
  // The upload key reaches Gradle only, copied out of the environment by `mobileBuild` before this: the configs and the
  // web build run in this process, so it leaves the environment before them, after the .env, which may have set it again.
  dropAndroidSigning(process.env)
  const { mobile, auth, url, name, notifications, backgroundColor } = await loadSourceConfig(dir, { command: 'build', extensions })
  const appName = appNameOver(process.env, name)
  return { mobile: mobile as unknown, notifications: Boolean(notifications), auth: auth && url ? { issuer: url, ...(appName && { appName }) } : undefined, ...(backgroundColor && { backgroundColor }) }
}
