import { existsSync, readdirSync } from 'node:fs'
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Platform } from './platform'

// Where Gradle's `bundleRelease` and `cap build ios` leave the signed binary in the workspace.
const androidBundle = ['android', 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab']
const iosOutput = ['ios', 'App', 'output']

/** The signed binary the build left in the workspace `ws`; it throws when there is none, as after a failed build. */
export const releaseFile = (ws: string, platform: Platform) => {
  if (platform === 'android') {
    const file = path.join(ws, ...androidBundle)
    if (!existsSync(file)) throw new Error(`The Android build left no ${file}`)
    return file
  }
  const dir = path.join(ws, ...iosOutput)
  const ipas = existsSync(dir) ? readdirSync(dir).filter((name) => name.endsWith('.ipa')) : []
  if (ipas.length !== 1) throw new Error(`The iOS build left ${ipas.length} .ipa files in ${dir}, not one`)
  return path.join(dir, ipas[0] as string)
}

/**
 * Copies the binary `file` into `outDir` as `<name>.aab` or `<name>.ipa`. A folder it creates ignores itself in git,
 * so a signed binary is never committed by accident; a `.gitignore` already there is left as it is.
 */
export const copyRelease = async (file: string, outDir: string, name: string) => {
  await mkdir(outDir, { recursive: true })
  const ignore = path.join(outDir, '.gitignore')
  if (!existsSync(ignore)) await writeFile(ignore, '*\n')
  const target = path.join(outDir, `${name}${path.extname(file)}`)
  await copyFile(file, target)
  return target
}
