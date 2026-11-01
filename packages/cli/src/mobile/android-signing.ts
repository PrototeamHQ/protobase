import { statSync } from 'node:fs'
import path from 'node:path'

// The developer's upload key reaches Gradle only, through these variables: never argv, where any local user reads it
// with `ps`, and never a file. Every other child, npm's install scripts and Capacitor included, goes without them.

/** The variables an Android release is signed from. */
export const androidSigningVariables = ['PROTOBASE_ANDROID_KEYSTORE', 'PROTOBASE_ANDROID_KEYSTORE_PASSWORD', 'PROTOBASE_ANDROID_KEY_ALIAS', 'PROTOBASE_ANDROID_KEY_PASSWORD'] as const

// Matched in any letter case, as Windows' environment is.
const signingNames = new Set<string>(androidSigningVariables)
const isSigningVariable = (key: string) => signingNames.has(key.toUpperCase())

/** `env` without the signing variables, in any letter case. */
export const withoutAndroidSigning = (env: Record<string, string>) => Object.fromEntries(Object.entries(env).filter(([key]) => !isSigningVariable(key)))

/**
 * Deletes from `env`, in place, every variable named `PROTOBASE_ANDROID_*` in any letter case: wider than the four, so
 * no such variable is left for the project's code to find, while Gradle, which reads the four by name, gets them apart.
 */
export const dropAndroidSigning = (env: NodeJS.ProcessEnv) => {
  for (const key of Object.keys(env)) if (key.toUpperCase().startsWith('PROTOBASE_ANDROID_')) delete env[key]
}

const isFile = (file: string) => {
  try {
    return statSync(file).isFile()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

/**
 * The signing variables Gradle gets, read from `env` and checked before anything is installed: all four set, and the
 * keystore a file, made absolute against the project folder since Gradle would read a relative one from `android/app`.
 */
export const androidSigning = (env: Record<string, string | undefined>, projectDir: string) => {
  const missing = androidSigningVariables.filter((key) => !env[key])
  if (missing.length > 0) throw new Error(`An Android release is signed with your upload key: set ${missing.join(', ')}`)
  const keystore = path.resolve(projectDir, env.PROTOBASE_ANDROID_KEYSTORE as string)
  if (!isFile(keystore)) throw new Error(`PROTOBASE_ANDROID_KEYSTORE names ${keystore}, which is not a file`)
  return { env: { ...Object.fromEntries(androidSigningVariables.map((key) => [key, env[key] as string])), PROTOBASE_ANDROID_KEYSTORE: keystore } }
}

const releaseAnchor = '    buildTypes {\n        release {\n'

const signingConfig = `    signingConfigs {
        release {
            storeFile file(System.getenv('PROTOBASE_ANDROID_KEYSTORE'))
            storePassword System.getenv('PROTOBASE_ANDROID_KEYSTORE_PASSWORD')
            keyAlias System.getenv('PROTOBASE_ANDROID_KEY_ALIAS')
            keyPassword System.getenv('PROTOBASE_ANDROID_KEY_PASSWORD')
        }
    }
`

/** The app's build.gradle signing its release build from the signing variables, naming them only, never a value. */
export const withReleaseSigning = (gradle: string) => {
  if (gradle.split(releaseAnchor).length !== 2 || gradle.includes('signingConfigs')) throw new Error('app/build.gradle does not have the one release build type of Capacitor\'s template')
  return gradle.replace(releaseAnchor, `${signingConfig}${releaseAnchor}            signingConfig signingConfigs.release\n`)
}
