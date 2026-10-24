import { rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { capacitorOrigin } from '@protobase/schema/internal'
import type { HttpAllowances } from './api-origin'
import type { Platform } from './platform'
import { webPartDir } from './web-part'

export type CapacitorConfigInput = {
  appId: string
  appName: string
  fingerprint: string
  /** The extra plugins' npm names: the only ones compiled into the app. */
  plugins: string[]
  allowances: HttpAllowances
  /** The origin of the API the app calls, the only one ProtobaseAuth signs in with. */
  apiOrigin: string
  platform: Platform
}

// The npm package of Protobase's native plugin: ProtobaseAuth, and the stand-ins that refuse page script Capacitor's
// own HTTP, cookie and WebView plugins and guard the local server.
const protobasePlugin = '@protobase/mobile'

// Capacitor's keyboard plugin, which on iOS shrinks the WebView to the space above the keyboard, as Android does, so a
// page as tall as the screen, such as the sign-in page, stays in view above it instead of scrolling half out of view.
const keyboardPlugin = '@capacitor/keyboard'

/**
 * The app's `capacitor.config.json`, every key it sets named here. It never sets `server.url`, the hostname or the
 * schemes (the API's CORS list names Capacitor's default origins), or WebView debugging (on in debug builds only).
 * `plugins` configures ProtobaseAuth and the keyboard plugin alone, so CapacitorHttp and CapacitorCookies stay off;
 * the keyboard plugin resizes natively, its default, and fills the space beside the keyboard's rounded corners with the
 * page's background instead of black. Protobase's plugin is compiled in last, so its stand-ins replace any plugin of
 * the same name. Service workers get nothing from the local server on Android, which they would reach past the
 * WebViewClient that guards it. The file ships outside the app's web part, so the fingerprint in the user agent and
 * ProtobaseAuth's origins are beyond page script and a live update.
 */
export const capacitorConfig = ({ appId, appName, fingerprint, plugins, allowances, apiOrigin, platform }: CapacitorConfigInput) => ({
  appId,
  appName,
  webDir: webPartDir,
  appendUserAgent: `ProtobaseNative/${fingerprint}`,
  includePlugins: [...plugins, keyboardPlugin, protobasePlugin],
  plugins: { ProtobaseAuth: { apiOrigin, origin: capacitorOrigin[platform] }, Keyboard: { autoBackdropColor: 'dom' } },
  ...(allowances.cleartext && { server: { cleartext: true } }),
  android: { resolveServiceWorkerRequests: false, ...(allowances.mixedContent && { allowMixedContent: true }) },
})

/** Writes the config into the workspace `dir`, removing the `.ts` and `.js` configs Capacitor would read instead. */
export const writeCapacitorConfig = async (dir: string, config: ReturnType<typeof capacitorConfig>) => {
  await Promise.all(['capacitor.config.ts', 'capacitor.config.js'].map((name) => rm(path.join(dir, name), { force: true })))
  await writeFile(path.join(dir, 'capacitor.config.json'), `${JSON.stringify(config, null, 2)}\n`)
}
