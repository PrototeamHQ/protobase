import path from 'node:path'
import type { Command } from 'commander'
import { resolveExtensions } from '../project/extensions'
import { parseAppVersion, parseBuildNumber, parsePlatform, parsePort, parseSigningName, parseTeamId } from './arguments'
import type { Platform } from './platform'

const out = (text: string) => process.stdout.write(text)

const collect = (value: string, previous: string[]) => [...previous, value]

export const registerMobile = (program: Command) => {
  const mobile = program.command('mobile').description("Build the project in the current directory as an iOS or Android app, from the mobile section of its protobase.config.ts")
  const api = '--api <url>'
  const apiHelp = "the server the app calls (default: the auth issuer, the project's baseURL)"
  const extend = "merge the protobase.config.ts and protobase.ui.tsx in this folder before the project's, repeatable"

  mobile
    .command('run')
    .description('Generate the native project and run the app in a simulator, an emulator or on a device')
    .argument('<platform>', 'ios or android', parsePlatform)
    .option(api, apiHelp)
    .option('--target <id>', 'the device or simulator to run on (default: Capacitor asks)')
    .option('--team <id>', 'iOS: your Apple Developer team id, which signs the app to run on your iPhone', parseTeamId)
    .option('--live', 'open the running protobase dev instead of the app\'s own files, reloading as you save', false)
    .option('--port <port>', 'the port of protobase dev, for --live', parsePort, 5173)
    .option('--extend <dir>', extend, collect, [])
    .action(async (chosen: Platform, opts) => {
      const { mobileRun } = await import('./run')
      const input = { projectDir: process.cwd(), platform: chosen, extensions: resolveExtensions(opts.extend), ...(opts.api !== undefined && { api: opts.api }), ...(opts.target && { target: opts.target }), ...(opts.team && { team: opts.team }) }
      await mobileRun({ ...input, ...(opts.live && { live: opts.port }) }, out)
    })

  mobile
    .command('open')
    .description('Generate the native project and open it in Xcode or Android Studio')
    .argument('<platform>', 'ios or android', parsePlatform)
    .option(api, apiHelp)
    .option('--extend <dir>', extend, collect, [])
    .action(async (chosen: Platform, opts) => {
      const { mobileOpen } = await import('./run')
      await mobileOpen({ projectDir: process.cwd(), platform: chosen, extensions: resolveExtensions(opts.extend), ...(opts.api !== undefined && { api: opts.api }) }, out)
    })

  mobile
    .command('build')
    .description('Generate the native project and build a signed release: an .aab for Google Play, an .ipa for the App Store')
    .argument('<platform>', 'ios or android', parsePlatform)
    .requiredOption('--app-version <version>', 'the version the stores show, such as 1.2.3', parseAppVersion)
    .requiredOption('--build-number <number>', 'the build number, higher with each upload', parseBuildNumber)
    .option(api, `${apiHelp}; https only`)
    .option('--out <dir>', 'the folder the binary goes to', 'mobile-release')
    .option('--team <id>', 'iOS: your Apple Developer team id', parseTeamId)
    .option('--certificate <name>', 'iOS, manual signing: the signing certificate', parseSigningName)
    .option('--profile <name>', 'iOS, manual signing: the provisioning profile', parseSigningName)
    .option('--extend <dir>', extend, collect, [])
    .action(async (chosen: Platform, opts) => {
      if (chosen === 'android' && (opts.team || opts.certificate || opts.profile)) throw new Error('--team, --certificate and --profile are for iOS: Android signs with the PROTOBASE_ANDROID_* variables')
      if (Boolean(opts.certificate) !== Boolean(opts.profile)) throw new Error('Manual signing takes both --certificate and --profile')
      const { mobileBuild } = await import('./build')
      const projectDir = process.cwd()
      await mobileBuild(
        {
          projectDir,
          platform: chosen,
          extensions: resolveExtensions(opts.extend),
          ...(opts.api !== undefined && { api: opts.api }),
          version: { version: opts.appVersion, build: opts.buildNumber },
          outDir: path.resolve(projectDir, opts.out),
          ...(opts.team && { ios: { team: opts.team, ...(opts.certificate && { manual: { certificate: opts.certificate, profile: opts.profile } }) } }),
        },
        out,
      )
    })
}
