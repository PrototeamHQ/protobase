import { statSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { ChildOptions, RunChild } from './child-process'

// The App Store Connect API key that signs without an Apple account in Xcode, as on a build machine.
const apiKeyVariables = ['PROTOBASE_IOS_API_KEY_PATH', 'PROTOBASE_IOS_API_KEY_ID', 'PROTOBASE_IOS_API_KEY_ISSUER'] as const

export type IosApiKey = { path: string; id: string; issuer: string }

/**
 * The API key in `env`, checked before anything is installed: none of its variables or all of them, the key a file,
 * made absolute against the project folder since xcodebuild runs in the native project. Without it Xcode signs with
 * the account in its settings.
 */
export const iosApiKey = (env: Record<string, string | undefined>, projectDir: string): IosApiKey | undefined => {
  const missing = apiKeyVariables.filter((key) => !env[key])
  if (missing.length === apiKeyVariables.length) return
  if (missing.length > 0) throw new Error(`Signing with an App Store Connect API key takes all of ${apiKeyVariables.join(', ')}: set ${missing.join(', ')}`)
  const file = path.resolve(projectDir, env.PROTOBASE_IOS_API_KEY_PATH as string)
  if (!statSync(file, { throwIfNoEntry: false })?.isFile()) throw new Error(`PROTOBASE_IOS_API_KEY_PATH names ${file}, which is not a file`)
  return { path: file, id: env.PROTOBASE_IOS_API_KEY_ID as string, issuer: env.PROTOBASE_IOS_API_KEY_ISSUER as string }
}

const archive = 'App.xcarchive'
const exportOptions = 'archive.plist'

// `-allowProvisioningUpdates` lets Xcode create what a new app lacks, certificate and profiles, with the key or account.
const provisioningArgs = (key: IosApiKey | undefined) => [
  '-allowProvisioningUpdates',
  ...(key ? ['-authenticationKeyPath', key.path, '-authenticationKeyID', key.id, '-authenticationKeyIssuerID', key.issuer] : []),
]

/** xcodebuild's arguments to archive the release for `team`. */
export const iosArchiveArgs = (team: string, key: IosApiKey | undefined) => [
  '-project',
  'App.xcodeproj',
  '-scheme',
  'App',
  '-configuration',
  'Release',
  '-destination',
  'generic/platform=iOS',
  '-archivePath',
  archive,
  'archive',
  `DEVELOPMENT_TEAM=${team}`,
  ...provisioningArgs(key),
]

/** xcodebuild's arguments to export the archive as an .ipa into `output`, where `releaseFile` finds it. */
export const iosExportArgs = (key: IosApiKey | undefined) => ['-exportArchive', '-archivePath', archive, '-exportOptionsPlist', exportOptions, '-exportPath', 'output', ...provisioningArgs(key)]

/** The export options of an App Store build `team` signs automatically; `team` is an id `--team` checked. */
export const iosExportOptions = (team: string) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
<key>method</key>
<string>app-store-connect</string>
<key>signingStyle</key>
<string>automatic</string>
<key>teamID</key>
<string>${team}</string>
</dict>
</plist>
`

/**
 * Archives and exports the iOS project in `ws` with automatic signing. xcodebuild runs here rather than through
 * `cap build ios`, which lets Xcode create nothing while archiving and cannot pass an API key to either step.
 */
export const buildIosAutomatic = async ({ ws, env, team, key }: { ws: string; env: ChildOptions['env']; team: string; key: IosApiKey | undefined }, run: RunChild) => {
  const cwd = path.join(ws, 'ios', 'App')
  await run('xcodebuild', iosArchiveArgs(team, key), { cwd, env })
  await writeFile(path.join(cwd, exportOptions), iosExportOptions(team))
  await run('xcodebuild', iosExportArgs(key), { cwd, env })
}
