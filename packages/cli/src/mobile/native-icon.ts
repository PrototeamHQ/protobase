import { existsSync } from 'node:fs'
import { copyFile } from 'node:fs/promises'
import path from 'node:path'
import type { Platform } from './platform'

const densities = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']

/**
 * The template's home-screen icon files, by path in the platform's native project, which Protobase's icon replaces:
 * iOS's one 1024 pixel icon; Android's legacy, round and adaptive foreground icons at each density, and the adaptive
 * icon's background colour.
 */
export const nativeIconFiles: Record<Platform, string[]> = {
  ios: ['App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'],
  android: [
    ...densities.flatMap((density) => ['ic_launcher', 'ic_launcher_round', 'ic_launcher_foreground'].map((icon) => `app/src/main/res/mipmap-${density}/${icon}.png`)),
    'app/src/main/res/values/ic_launcher_background.xml',
  ],
}

/** Where @protobase/mobile, installed in the workspace `ws`, has Protobase's icon for the platform, by the same paths. */
export const protobaseIconDir = (ws: string, platform: Platform) => path.join(ws, 'node_modules', '@protobase', 'mobile', 'icon', platform)

/**
 * Gives the platform's native project in the workspace Protobase's icon in place of Capacitor's. Each file must be one
 * the template has, so a template that moves its icon fails here rather than leaving Capacitor's on the phone.
 */
export const withProtobaseIcon = async (ws: string, platform: Platform) => {
  for (const file of nativeIconFiles[platform]) {
    const from = path.join(protobaseIconDir(ws, platform), file)
    const to = path.join(ws, platform, file)
    if (!existsSync(from)) throw new Error(`@protobase/mobile has no ${path.join(platform, file)} of Protobase's icon`)
    if (!existsSync(to)) throw new Error(`The generated ${platform} project has no ${file}, the icon Protobase's replaces`)
    await copyFile(from, to)
  }
}
