import { type Command, InvalidArgumentError } from 'commander'
import { resolveExtensions } from '../project/extensions'
import { platforms, type Platform } from './platform'

const out = (text: string) => process.stdout.write(text)

const collect = (value: string, previous: string[]) => [...previous, value]

const platform = (value: string): Platform => {
  if ((platforms as readonly string[]).includes(value)) return value as Platform
  throw new InvalidArgumentError('expected ios or android')
}

const port = (value: string) => {
  const number = /^\d{1,5}$/.test(value) ? Number(value) : 0
  if (number < 1 || number > 65535) throw new InvalidArgumentError('expected a port from 1 to 65535')
  return number
}

export const registerMobile = (program: Command) => {
  const mobile = program.command('mobile').description("Build the project in the current directory as an iOS or Android app, from the mobile section of its protobase.config.ts")
  const api = '--api <url>'
  const apiHelp = "the server the app calls (default: the auth issuer, the project's baseURL)"
  const extend = "merge the protobase.config.ts and protobase.ui.tsx in this folder before the project's, repeatable"

  mobile
    .command('run')
    .description('Generate the native project and run the app in a simulator, an emulator or on a device')
    .argument('<platform>', 'ios or android', platform)
    .option(api, apiHelp)
    .option('--target <id>', 'the device or simulator to run on (default: Capacitor asks)')
    .option('--live', 'open the running protobase dev instead of the app\'s own files, reloading as you save', false)
    .option('--port <port>', 'the port of protobase dev, for --live', port, 5173)
    .option('--extend <dir>', extend, collect, [])
    .action(async (chosen: Platform, opts) => {
      const { mobileRun } = await import('./run')
      const input = { projectDir: process.cwd(), platform: chosen, extensions: resolveExtensions(opts.extend), ...(opts.api !== undefined && { api: opts.api }), ...(opts.target && { target: opts.target }) }
      await mobileRun({ ...input, ...(opts.live && { live: opts.port }) }, out)
    })

  mobile
    .command('open')
    .description('Generate the native project and open it in Xcode or Android Studio')
    .argument('<platform>', 'ios or android', platform)
    .option(api, apiHelp)
    .option('--extend <dir>', extend, collect, [])
    .action(async (chosen: Platform, opts) => {
      const { mobileOpen } = await import('./run')
      await mobileOpen({ projectDir: process.cwd(), platform: chosen, extensions: resolveExtensions(opts.extend), ...(opts.api !== undefined && { api: opts.api }) }, out)
    })
}
