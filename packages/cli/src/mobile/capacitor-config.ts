import { rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { HttpAllowances } from './api-origin'
import { webPartDir } from './web-part'

export type CapacitorConfigInput = {
  appId: string
  appName: string
  fingerprint: string
  /** The extra plugins' npm names: the only ones compiled into the app. */
  plugins: string[]
  allowances: HttpAllowances
}

/**
 * The app's `capacitor.config.json`, every key it sets named here. It never sets `server.url`, the hostname or the
 * schemes (the API's CORS list names Capacitor's default origins), `plugins` (so CapacitorHttp and CapacitorCookies
 * stay off) or WebView debugging (on in debug builds only). The fingerprint goes in the user agent, which a live
 * update cannot change.
 */
export const capacitorConfig = ({ appId, appName, fingerprint, plugins, allowances }: CapacitorConfigInput) => ({
  appId,
  appName,
  webDir: webPartDir,
  appendUserAgent: `ProtobaseNative/${fingerprint}`,
  includePlugins: plugins,
  ...(allowances.cleartext && { server: { cleartext: true } }),
  ...(allowances.mixedContent && { android: { allowMixedContent: true } }),
})

/** Writes the config into the workspace `dir`, removing the `.ts` and `.js` configs Capacitor would read instead. */
export const writeCapacitorConfig = async (dir: string, config: ReturnType<typeof capacitorConfig>) => {
  await Promise.all(['capacitor.config.ts', 'capacitor.config.js'].map((name) => rm(path.join(dir, name), { force: true })))
  await writeFile(path.join(dir, 'capacitor.config.json'), `${JSON.stringify(config, null, 2)}\n`)
}
