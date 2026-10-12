import type { JsonValue } from '@protobase/schema'

/**
 * A plugin the admin app loads at runtime: `url` names its plugin.json (`protobase build-plugin` writes it), on another
 * origin or this one (`/plugins/...`). The plugin reads `settings` with `usePlugin()`. With `roles`, `/meta` names it
 * only to callers holding one of them; without, to everyone.
 */
export type PluginOption = { url: string; settings?: Record<string, JsonValue>; roles?: string[] }

/** A plugin as `/meta` names it to a caller. */
export type PluginRef = { url: string; settings?: Record<string, JsonValue> }

/** The platform's plugins, as plugin.json URLs separated by commas, loaded after the ones `options.plugins` lists. */
export const pluginsVariable = 'PROTOBASE_PLUGINS'

// An absolute http(s) URL, or a path on the app's own origin.
const checkedPluginUrl = (url: string, source: string) => {
  if (url.startsWith('/') && !url.startsWith('//')) return url
  if (!URL.canParse(url)) throw new Error(`${source} names "${url}", which is no URL; use https://... or a path such as /plugins/name/plugin.json`)
  const { protocol } = new URL(url)
  if (protocol !== 'https:' && protocol !== 'http:') throw new Error(`${source} names "${url}", which must start with https:// or http://, not ${protocol}//`)
  return url
}

/**
 * The plugins the app loads: the `bundled` ones its bundle carries, then those `options.plugins` lists, then those
 * `PROTOBASE_PLUGINS` adds, each URL once. `false` turns off the last two; the bundle's are the app's own UI. A value
 * that is no URL stops the server at startup.
 */
export const pluginOptions = (option: PluginOption[] | false | undefined, env: Record<string, string | undefined>, bundled: readonly string[] = []): PluginOption[] => {
  const own = bundled.map((url) => ({ url: checkedPluginUrl(url, 'the bundle') }))
  if (option === false) return own
  const given = (option ?? []).map((plugin) => ({ ...plugin, url: checkedPluginUrl(plugin.url.trim(), 'options.plugins') }))
  const listed = (env[pluginsVariable] ?? '')
    .split(',')
    .map((url) => url.trim())
    .filter((url) => url !== '')
    .map((url) => ({ url: checkedPluginUrl(url, pluginsVariable) }))
  const all = [...own, ...given, ...listed]
  return all.filter((plugin, index) => all.findIndex((other) => other.url === plugin.url) === index)
}

/** The plugins `/meta` names to a caller with `roles`: those for everyone, and those for one of their roles. */
export const pluginsFor = (plugins: readonly PluginOption[], roles: readonly string[]): PluginRef[] =>
  plugins.filter((plugin) => !plugin.roles || plugin.roles.some((role) => roles.includes(role))).map(({ url, settings }) => ({ url, ...(settings && { settings }) }))
