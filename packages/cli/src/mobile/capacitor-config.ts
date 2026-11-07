import { rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { capacitorOrigin } from '@protobase/schema/internal'
import type { HttpAllowances } from './api-origin'
import type { LiveUpdateSettings } from './live-update-settings'
import { pushPlugin } from './pinned-packages'
import type { Platform } from './platform'
import { webPartDir } from './web-part'

export type CapacitorConfigInput = {
  appId: string
  appName: string
  fingerprint: string
  /** The Protobase version of the shell the binary is built with. */
  shellVersion: string
  /** The extra plugins' npm names: with the live updater, the only ones compiled into the app. */
  plugins: string[]
  /** With them, the live updater is compiled in (see `liveUpdateSettings`). */
  liveUpdate?: LiveUpdateSettings
  allowances: HttpAllowances
  /** The origin of the API the app calls, the only one ProtobaseAuth signs in with. */
  apiOrigin: string
  platform: Platform
  /** A store release, which page inspection is off for. */
  release?: boolean
  /** Native push: Capacitor's push plugin compiled in, showing a push while the app is open too. */
  push?: boolean
}

// The npm package of Protobase's native plugin: ProtobaseAuth, and the stand-ins that refuse page script Capacitor's
// own HTTP, cookie and WebView plugins and guard the local server.
const protobasePlugin = '@protobase/mobile'

// Capacitor's keyboard plugin, which on iOS shrinks the WebView to the space above the keyboard, as Android does, so a
// page as tall as the screen, such as the sign-in page, stays in view above it instead of scrolling half out of view.
const keyboardPlugin = '@capacitor/keyboard'

const liveUpdatePlugin = '@capawesome/capacitor-live-update'

// What the push plugin does with a push that arrives while the app is open: shows it, as the phone does otherwise.
const pushPresentation = ['badge', 'sound', 'alert']

// How long a live update has to start, the shell calling ready(), before the app goes back to its own files and blocks
// it: a slow or busy phone took up to 10 s on an emulator of one core, so a good release keeps a wide margin.
const readyTimeout = 30_000

/**
 * The app's `capacitor.config.json`, every key it sets named here. It never sets `server.url`, the hostname or the
 * schemes (the API's CORS list names Capacitor's default origins). WebView debugging is off in an iOS release by name:
 * Capacitor's prebuilt simulator framework is a Debug build, so its default lists a Release app in Safari's Develop menu.
 * `plugins` configures ProtobaseAuth, the keyboard plugin and, with the live updater, what its guard needs: the key
 * releases are signed with, where they come from, the binary's fingerprint, shell version and the order of its own
 * files, background updates off, a rolled-back bundle blocked and `readyTimeout`, within which the shell must call
 * ready() or the app goes back to its own files. CapacitorHttp and CapacitorCookies stay off; the keyboard plugin
 * resizes natively, its default, and fills the space beside the keyboard's rounded corners with the page's background
 * instead of black. With `push`, Capacitor's push plugin is compiled in and shows a push while the app is open. It
 * never sets `server.allowNavigation`, so no other host loads inside the WebView. Protobase's plugin is compiled in last, so its stand-ins replace any plugin of the same name.
 * Service workers get nothing from the local server on Android, which they would reach past the WebViewClient that
 * guards it. The file ships outside the app's web part, so the fingerprint in the user agent and ProtobaseAuth's
 * origins are beyond page script and a live update.
 */
export const capacitorConfig = ({ appId, appName, fingerprint, shellVersion, plugins, liveUpdate, allowances, apiOrigin, platform, release, push }: CapacitorConfigInput) => ({
  appId,
  appName,
  webDir: webPartDir,
  appendUserAgent: `ProtobaseNative/${fingerprint}`,
  includePlugins: [...plugins, ...(liveUpdate ? [liveUpdatePlugin] : []), ...(push ? [pushPlugin] : []), keyboardPlugin, protobasePlugin],
  plugins: {
    ProtobaseAuth: { apiOrigin, origin: capacitorOrigin[platform] },
    Keyboard: { autoBackdropColor: 'dom' },
    ...(push && { PushNotifications: { presentationOptions: pushPresentation } }),
    ...(liveUpdate && {
      LiveUpdate: { ...liveUpdate, readyTimeout, autoUpdateStrategy: 'none', autoDeleteBundles: true, autoBlockRolledBackBundles: true, fingerprint, shellVersion },
    }),
  },
  ...(allowances.cleartext && { server: { cleartext: true } }),
  android: { resolveServiceWorkerRequests: false, ...(allowances.mixedContent && { allowMixedContent: true }) },
  ...(release && platform === 'ios' && { ios: { webContentsDebuggingEnabled: false } }),
})

/** Writes the config into the workspace `dir`, removing the `.ts` and `.js` configs Capacitor would read instead. */
export const writeCapacitorConfig = async (dir: string, config: ReturnType<typeof capacitorConfig>) => {
  await Promise.all(['capacitor.config.ts', 'capacitor.config.js'].map((name) => rm(path.join(dir, name), { force: true })))
  await writeFile(path.join(dir, 'capacitor.config.json'), `${JSON.stringify(config, null, 2)}\n`)
}
