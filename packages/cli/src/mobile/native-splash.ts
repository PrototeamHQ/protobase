import { existsSync } from 'node:fs'
import { cp, rm } from 'node:fs/promises'
import path from 'node:path'
import type { Platform } from './platform'

/** Where @protobase/mobile, installed in the workspace `ws`, has the platform's splash files, by their native project paths. */
export const protobaseSplashDir = (ws: string, platform: Platform) => path.join(ws, 'node_modules', '@protobase', 'mobile', 'splash', platform)

/** Copies Protobase's splash file or folder `file` into the platform's native project in the workspace, by the same path. */
export const copySplashFile = async (ws: string, platform: Platform, file: string) => {
  const from = path.join(protobaseSplashDir(ws, platform), file)
  if (!existsSync(from)) throw new Error(`@protobase/mobile has no ${path.join(platform, file)} of Protobase's splash screen`)
  await cp(from, path.join(ws, platform, file), { recursive: true })
}

/**
 * Removes the template's splash file or folder `file` from the platform's native project in the workspace. It must be
 * one the template has, so a template that moves its splash fails here rather than leaving Capacitor's on the phone.
 */
export const removeTemplateSplash = async (ws: string, platform: Platform, file: string) => {
  const at = path.join(ws, platform, file)
  if (!existsSync(at)) throw new Error(`The generated ${platform} project has no ${file}, the splash screen Protobase's replaces`)
  await rm(at, { recursive: true })
}
