import { androidAppIcon } from './android-app-icon'
import { loadSharp, type Sharp } from './icon-sharp'
import { readIconSource, type IconSource } from './icon-source'
import { iosAppIcon, iosAppSplash } from './ios-app-icon'
import type { NativeFile } from './native-file'
import type { Platform } from './platform'

/** The files of the app's own icon for a platform: its home-screen icon, and on iOS the launch screen's image of it. */
export type AppIconFiles = { icon: NativeFile[]; splash: NativeFile[] }

/** The files of the app's icon `source` for the platform, on `background`, a `#rrggbb` colour. */
export const appIconFiles = async (sharp: Sharp, source: IconSource, background: string, platform: Platform): Promise<AppIconFiles> => {
  if (platform === 'android') return { icon: await androidAppIcon(sharp, source, background), splash: [] }
  return { icon: await iosAppIcon(sharp, source, background), splash: await iosAppSplash(sharp, source, background) }
}

/** The files of the app's icon `file`, `mobile.icon`, for the platform, drawn with the sharp installed in the workspace `ws`. */
export const appIcon = async ({ ws, projectDir, file, background, platform }: { ws: string; projectDir: string; file: string; background: string; platform: Platform }) => {
  const sharp = loadSharp(ws)
  return appIconFiles(sharp, await readIconSource(sharp, projectDir, file), background, platform)
}
