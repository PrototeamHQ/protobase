import { appNameOver } from '@protobase/server'
import { loadSourceConfig } from '../config/source-config'
import { loadNearestEnvFile } from '../dev/env'
import type { Extension } from '../project/extensions'

/**
 * What a mobile build needs of the project in `dir`, merged as `protobase dev` merges it after the configs of
 * `extensions`: its mobile section, unchecked, and with sign-in on the app's URL, its tokens' issuer, and its name.
 * The project's .env is loaded first, as other commands do; nothing but the configs runs.
 */
export const loadMobileProject = async (dir: string, extensions: Extension[]) => {
  loadNearestEnvFile(dir)
  const { mobile, auth, url, name } = await loadSourceConfig(dir, { command: 'tool', extensions })
  const appName = appNameOver(process.env, name)
  return { mobile: mobile as unknown, auth: auth && url ? { issuer: url, ...(appName && { appName }) } : undefined }
}
