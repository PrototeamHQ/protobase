import path from 'node:path'
import { defaultAppName } from '@protobase/server'
import type { Extension } from '../project/extensions'
import { withoutAndroidSigning } from './android-signing'
import { apiUrl, checkReleaseUrl, httpAllowances } from './api-origin'
import { capRunArgs } from './cap-run-args'
import { capacitorRunner } from './capacitor'
import { capacitorConfig, writeCapacitorConfig } from './capacitor-config'
import { childEnv, envFileKeys, projectEnvFiles } from './child-env'
import { runChild, type RunChild } from './child-process'
import { nativeFingerprint } from './fingerprint'
import { generatePlatform } from './generate'
import { loadMobileProject } from './load-project'
import { checkMobileConfig } from './mobile-config'
import { checkInstalledPlugins, pinnedNative } from './pinned-packages'
import type { Platform } from './platform'
import { checkProtobasePlugin } from './protobase-plugin'
import { buildWebPart, placeholderWebPart, type WebPartInput } from './web-part'
import { mobileSpec, prepareWorkspace, workspaceDir, workspacePackageJson } from './workspace'

export type MobileInput = {
  /** The project folder, the one the command runs in. */
  projectDir: string
  platform: Platform
  /** The server the app calls; default the auth issuer. */
  api?: string
  extensions: Extension[]
  /** For `run`: the device or simulator. */
  target?: string
  /** For `run`: the port of the running `protobase dev` to open instead of the app's own files. */
  live?: number
  /** For `build`: a store release, which calls its server over https only. */
  release?: boolean
}

/** What a mobile command runs, which tests replace. */
export type MobileDeps = { run?: RunChild; build?: WebPartInput['build'] }

// Generates the platform's native project from the project's config, and gives what runs Capacitor in it.
export const prepare = async ({ projectDir, platform, api, extensions, live, release }: MobileInput, { run = runChild, build }: MobileDeps) => {
  // Taken before the project's .env and config are loaded, which may write into the environment, and without the keys
  // of the env files Bun loaded from this folder before the CLI started, nor the Android upload key's.
  const env = withoutAndroidSigning(childEnv({ ...process.env }, envFileKeys(projectEnvFiles(projectDir))))
  if (live !== undefined && api !== undefined) throw new Error('--live opens protobase dev, which serves the API itself: leave out --api')
  const project = await loadMobileProject(projectDir, extensions)
  const mobile = checkMobileConfig(project.mobile)
  const url = live === undefined ? apiUrl(api, project.auth?.issuer, platform) : new URL(`http://localhost:${live}`)
  if (release) checkReleaseUrl(url)
  const allowances = httpAllowances(url)

  const ws = workspaceDir(projectDir)
  const plugins = Object.keys(mobile.plugins ?? {})
  await prepareWorkspace(ws, workspacePackageJson({ mobileSpec: mobileSpec(), ...(mobile.plugins && { plugins: mobile.plugins }) }), (command, args) => run(command, args, { cwd: ws, env }))
  checkInstalledPlugins(ws, plugins)

  if (live === undefined) await buildWebPart({ projectDir, ws, extensions, apiOrigin: url.origin, ...(build && { build }), onWarning: (message) => process.stderr.write(`warning: ${message}\n`) })
  else await placeholderWebPart(ws)
  const fingerprint = nativeFingerprint(pinnedNative, mobile.plugins)
  const appName = project.auth?.appName ?? defaultAppName
  await writeCapacitorConfig(ws, capacitorConfig({ appId: mobile.appId, appName, fingerprint, plugins, allowances, apiOrigin: url.origin, platform }))
  const cap = capacitorRunner(ws, env, run)
  await generatePlatform(ws, platform, allowances, cap)
  // iOS gets the plugin in a later release; until then its app signs in as before.
  if (platform === 'android') await checkProtobasePlugin(ws)
  return { ws, url, fingerprint, cap, env, appId: mobile.appId }
}

export const summary = (projectDir: string, { ws, url, fingerprint }: { ws: string; url: URL; fingerprint: string }) =>
  `workspace ${path.relative(projectDir, ws)}, api ${url.origin}, native fingerprint ${fingerprint}\n`

/** `protobase mobile run`: generates the native project and runs the app on a simulator, emulator or device. */
export const mobileRun = async (input: MobileInput, out: (text: string) => void, deps: MobileDeps = {}) => {
  const prepared = await prepare(input, deps)
  out(summary(input.projectDir, prepared))
  await prepared.cap(capRunArgs({ platform: input.platform, url: prepared.url, ...(input.target && { target: input.target }), ...(input.live !== undefined && { live: input.live }) }))
}

/** `protobase mobile open`: generates the native project and opens it in Xcode or Android Studio. */
export const mobileOpen = async (input: Omit<MobileInput, 'target' | 'live'>, out: (text: string) => void, deps: MobileDeps = {}) => {
  const prepared = await prepare(input, deps)
  out(summary(input.projectDir, prepared))
  await prepared.cap(['open', input.platform])
}
