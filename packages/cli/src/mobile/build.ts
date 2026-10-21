import path from 'node:path'
import { androidSigning } from './android-signing'
import type { AppVersion } from './app-version'
import { runChild } from './child-process'
import { copyRelease, releaseFile } from './release-output'
import { prepareReleaseProject } from './release-project'
import { type MobileDeps, type MobileInput, prepare, summary } from './run'

/** How Xcode signs an iOS release: the team, and for manual signing the certificate and profile. */
export type IosSigning = { team: string; manual?: { certificate: string; profile: string } }

export type MobileBuildInput = Omit<MobileInput, 'target' | 'live' | 'release'> & {
  version: AppVersion
  /** The folder the signed binary goes to. */
  outDir: string
  /** Required for iOS. */
  ios?: IosSigning
}

// Gradle in one process that ends with the build, so nothing outlives it holding the upload key in its environment,
// whatever the developer's gradle.properties say, and no configuration cache keeping what the build script read.
const gradleArgs = [':app:bundleRelease', '--no-daemon', '--no-configuration-cache', '-Pkotlin.compiler.execution.strategy=in-process']

const capBuildIos = ({ team, manual }: IosSigning) => [
  'build',
  'ios',
  '--xcode-team-id',
  team,
  ...(manual ? ['--xcode-signing-style', 'manual', '--xcode-signing-certificate', manual.certificate, '--xcode-provisioning-profile', manual.profile] : []),
]

/** `protobase mobile build`: generates the native project as a release, builds it signed and copies the binary out. */
export const mobileBuild = async (input: MobileBuildInput, out: (text: string) => void, deps: MobileDeps = {}) => {
  const { version, outDir, ios, ...mobile } = input
  if (mobile.platform === 'ios' && !ios) throw new Error('An iOS release is signed by your Apple Developer team: pass --team')
  // Checked before anything is installed.
  const signing = mobile.platform === 'android' ? androidSigning(process.env, mobile.projectDir) : undefined
  const prepared = await prepare({ ...mobile, release: true }, deps)
  out(summary(mobile.projectDir, prepared))
  await prepareReleaseProject(prepared.ws, mobile.platform, version)

  if (signing) {
    const android = path.join(prepared.ws, 'android')
    await (deps.run ?? runChild)(path.join(android, 'gradlew'), gradleArgs, { cwd: android, env: { ...prepared.env, ...signing.env } })
  } else await prepared.cap(capBuildIos(ios as IosSigning))

  const file = await copyRelease(releaseFile(prepared.ws, mobile.platform), outDir, `${prepared.appId}-${version.version}-${version.build}`)
  out(`release ${path.relative(mobile.projectDir, file)}\n`)
}
