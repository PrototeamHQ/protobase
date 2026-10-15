import type { JsonValue } from '@protobase/schema'

/**
 * A plugin the admin app loads at runtime: `url` names its plugin.json (`protobase build-plugin` writes it), on another
 * origin or this one (`/plugins/...`). The plugin reads `settings` with `usePlugin()`. With `roles`, `/meta` names it
 * only to callers holding one of them; without, to everyone. With `beforeSignIn`, the sign-in status names it to
 * everyone, so the app loads it before anyone signs in and draws its `beforeSignIn` component around the pages someone
 * signed out sees; it cannot have `roles`, since someone signed out has none.
 */
export type PluginOption = { url: string; settings?: Record<string, JsonValue>; roles?: string[]; beforeSignIn?: boolean }

/** A plugin as `/meta` names it to a caller. */
export type PluginRef = { url: string; settings?: Record<string, JsonValue> }

/** The platform's plugins, as plugin.json URLs separated by commas, loaded after the ones `options.plugins` lists. */
export const pluginsVariable = 'PROTOBASE_PLUGINS'

/** The platform's plugins that load before sign-in, as `PROTOBASE_PLUGINS` lists them, after the ones it lists. */
export const beforeSignInPluginsVariable = 'PROTOBASE_PLUGINS_BEFORE_SIGN_IN'

// An absolute http(s) URL, or a path on the app's own origin.
const checkedPluginUrl = (url: string, source: string) => {
  if (url.startsWith('/') && !url.startsWith('//')) return url
  if (!URL.canParse(url)) throw new Error(`${source} names "${url}", which is no URL; use https://... or a path such as /plugins/name/plugin.json`)
  const { protocol } = new URL(url)
  if (protocol !== 'https:' && protocol !== 'http:') throw new Error(`${source} names "${url}", which must start with https:// or http://, not ${protocol}//`)
  return url
}

const listedIn = (env: Record<string, string | undefined>, variable: string) =>
  (env[variable] ?? '')
    .split(',')
    .map((url) => url.trim())
    .filter((url) => url !== '')
    .map((url) => checkedPluginUrl(url, variable))

/**
 * The plugins the app loads: the `bundled` ones its bundle carries, then those `options.plugins` lists, then those
 * `PROTOBASE_PLUGINS` and `PROTOBASE_PLUGINS_BEFORE_SIGN_IN` add, each URL once, where it is first listed. A URL either
 * of the last two lists loads before sign-in. `false` turns off all but the bundle's, which are the app's own UI. A
 * value that is no URL, or a plugin that loads before sign-in only for some roles, stops the server at startup.
 */
export const pluginOptions = (option: PluginOption[] | false | undefined, env: Record<string, string | undefined>, bundled: readonly string[] = []): PluginOption[] => {
  const own = bundled.map((url) => ({ url: checkedPluginUrl(url, 'the bundle') }))
  if (option === false) return own
  const given = (option ?? []).map((plugin) => ({ ...plugin, url: checkedPluginUrl(plugin.url.trim(), 'options.plugins') }))
  const listed = listedIn(env, pluginsVariable).map((url) => ({ url }))
  const early = new Set(listedIn(env, beforeSignInPluginsVariable))
  const all: PluginOption[] = [...own, ...given, ...listed, ...[...early].map((url) => ({ url }))]
  const plugins = all
    .filter((plugin, index) => all.findIndex((other) => other.url === plugin.url) === index)
    .map((plugin) => (early.has(plugin.url) ? { ...plugin, beforeSignIn: true } : plugin))
  const limited = plugins.find((plugin) => plugin.beforeSignIn && plugin.roles)
  if (limited) throw new Error(`The plugin ${limited.url} loads before sign-in and only for some roles; someone signed out has no role, so drop its roles or beforeSignIn`)
  return plugins
}

const refOf = ({ url, settings }: PluginOption): PluginRef => ({ url, ...(settings && { settings }) })

/** The plugins `/meta` names to a caller with `roles`: those for everyone, and those for one of their roles. */
export const pluginsFor = (plugins: readonly PluginOption[], roles: readonly string[]): PluginRef[] =>
  plugins.filter((plugin) => !plugin.roles || plugin.roles.some((role) => roles.includes(role))).map(refOf)

/** The plugins the sign-in status names to everyone, for the app to load before anyone signs in. */
export const pluginsBeforeSignIn = (plugins: readonly PluginOption[]): PluginRef[] => plugins.filter((plugin) => plugin.beforeSignIn).map(refOf)
