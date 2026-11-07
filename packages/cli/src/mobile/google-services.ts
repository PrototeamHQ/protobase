import { copyFile, lstat } from 'node:fs/promises'
import path from 'node:path'

/** Where an Android app's Firebase file is kept: the project's root, next to protobase.config.ts. */
export const googleServicesFile = (projectDir: string) => path.join(projectDir, 'google-services.json')

/** Why an Android build with `notifications()` has no push, naming the file it looks for. */
export const missingGoogleServices = (projectDir: string) =>
  `${googleServicesFile(projectDir)} is missing: the Android app builds without push. Put your Firebase project's google-services.json there to turn it on`

/**
 * Whether the project has its Firebase file: a regular file, never a link, which the copy would follow out of the
 * project. Anything else at that place stops the build.
 */
export const hasGoogleServices = async (projectDir: string) => {
  const file = googleServicesFile(projectDir)
  const stats = await lstat(file).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return undefined
    throw error
  })
  if (!stats) return false
  if (!stats.isFile()) throw new Error(`${file} is not a regular file: put the google-services.json of your Firebase project there`)
  return true
}

/**
 * Copies the project's Firebase file into the generated Android app, where the template's build.gradle applies the
 * google-services plugin only when the file is there.
 */
export const copyGoogleServices = (projectDir: string, ws: string) =>
  copyFile(googleServicesFile(projectDir), path.join(ws, 'android', 'app', 'google-services.json'))
