import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

/** The classes of Protobase's native plugin that keep page script away from the session, by Java class name. */
export const protobasePluginClasses = ['ProtobaseAuth', 'RefusedHttp', 'RefusedCookies', 'RefusedWebView', 'LocalServerGuard'].map((name) => `net.protobase.mobile.${name}`)

const liveUpdatePackage = '@capawesome/capacitor-live-update'
const stockLiveUpdate = 'io.capawesome.capacitorjs.plugins.liveupdate.LiveUpdatePlugin'
const guardedLiveUpdate = { pkg: '@protobase/mobile', classpath: 'net.protobase.mobile.GuardedLiveUpdate' }

type PluginEntry = { pkg: string; classpath: string }

const pluginsFile = (ws: string) => path.join(ws, 'android', 'app', 'src', 'main', 'assets', 'capacitor.plugins.json')
const readPlugins = async (ws: string) => JSON.parse(await readFile(pluginsFile(ws), 'utf8')) as PluginEntry[]

/**
 * Puts Protobase's guarded live updater in the stock one's place in the plugin list `cap add android` writes, so page
 * script reaches only what the shell needs; listing both would run two updaters. The guard compiles from the same
 * plugin list, and the build checks it again (@protobase/mobile's build.gradle). An app without the plugin is left as is.
 */
export const guardLiveUpdate = async (ws: string) => {
  const entries = await readPlugins(ws)
  if (!entries.some(({ classpath }) => classpath === stockLiveUpdate)) return
  const guarded = entries.map((entry) => (entry.classpath === stockLiveUpdate ? guardedLiveUpdate : entry))
  await writeFile(pluginsFile(ws), JSON.stringify(guarded, null, '\t'))
}

/**
 * Checks that `cap add android` compiled Protobase's native plugin into the app, from the plugin list it writes: an
 * installed @protobase/mobile older than the CLI's, as a workspace left from an earlier CLI may hold, has none. Refuses
 * any class of the live updater's own package still listed, which no guard stands in front of.
 */
export const checkProtobasePlugin = async (ws: string) => {
  const entries = await readPlugins(ws)
  const unguarded = entries.find(({ pkg, classpath }) => pkg === liveUpdatePackage || classpath === stockLiveUpdate)
  if (unguarded) throw new Error(`The Android app lists ${unguarded.classpath}, which hands page script the live updater unguarded`)
  const listed = new Set(entries.map(({ classpath }) => classpath))
  const missing = protobasePluginClasses.filter((name) => !listed.has(name))
  if (missing.length === 0) return
  throw new Error(`The Android app lacks Protobase's native plugin (${missing.join(', ')}): delete ${ws} and run the command again`)
}

/**
 * The classes of Protobase's iOS plugin, by `@objc` name: the bounce Capacitor turns off, and ProtobaseAuth, which keeps
 * page script away from the session.
 */
export const protobaseIosPluginClasses = ['ProtobaseBounce', 'ProtobaseAuthPlugin']

/** The Swift package product `cap add ios` compiles @protobase/mobile into, by the name @capacitor/cli's fixName gives. */
export const protobaseIosProduct = 'ProtobaseMobile'

// A file `cap add ios` writes, or `undefined` when it is missing.
const readIosFile = (ws: string, ...parts: string[]) => readFile(path.join(ws, 'ios', 'App', ...parts), 'utf8').catch((error: NodeJS.ErrnoException): undefined => {
  if (error.code === 'ENOENT') return
  throw error
})

// The class list of a capacitor.config.json; an unparsable one lists nothing.
const iosClassList = (text: string | undefined) => {
  if (text === undefined) return []
  let parsed: { packageClassList?: unknown } | null
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    if (error instanceof SyntaxError) return []
    throw error
  }
  const classes = parsed?.packageClassList
  return Array.isArray(classes) ? classes.filter((name): name is string => typeof name === 'string') : []
}

/**
 * Checks what `cap add ios` writes: the class list, which must name Protobase's plugin classes and not the live updater,
 * which has no guard on iOS yet, and the app's Swift package, which must compile Protobase's product in; a class listed
 * without its product is skipped at launch without a word. A workspace left from an earlier CLI may lack either.
 */
export const checkIosPlugins = async (ws: string) => {
  const stale = (what: string) => new Error(`The iOS app lacks Protobase's native plugin (${what}): delete ${ws} and run the command again`)
  const classes = iosClassList(await readIosFile(ws, 'App', 'capacitor.config.json'))
  if (classes.includes('LiveUpdatePlugin')) throw new Error('The iOS app lists LiveUpdatePlugin, which has no guard against page script on iOS yet')
  const missing = protobaseIosPluginClasses.filter((name) => !classes.includes(name))
  if (missing.length > 0) throw stale(missing.join(', '))
  const manifest = await readIosFile(ws, 'CapApp-SPM', 'Package.swift')
  if (!manifest?.includes(`.product(name: "${protobaseIosProduct}"`)) throw stale(protobaseIosProduct)
}
