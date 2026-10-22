import { readFile } from 'node:fs/promises'
import path from 'node:path'

/** The classes of Protobase's native plugin that keep page script away from the session, by Java class name. */
export const protobasePluginClasses = ['ProtobaseAuth', 'RefusedHttp', 'RefusedCookies', 'RefusedWebView', 'LocalServerGuard'].map((name) => `net.protobase.mobile.${name}`)

/**
 * Checks that `cap add android` compiled Protobase's native plugin into the app, from the plugin list it writes: an
 * installed @protobase/mobile older than the CLI's, as a workspace left from an earlier CLI may hold, has none.
 */
export const checkProtobasePlugin = async (ws: string) => {
  const file = path.join(ws, 'android', 'app', 'src', 'main', 'assets', 'capacitor.plugins.json')
  const listed = new Set((JSON.parse(await readFile(file, 'utf8')) as Array<{ classpath: string }>).map(({ classpath }) => classpath))
  const missing = protobasePluginClasses.filter((name) => !listed.has(name))
  if (missing.length === 0) return
  throw new Error(`The Android app lacks Protobase's native plugin (${missing.join(', ')}): delete ${ws} and run the command again`)
}
