import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { oauthWellKnownPaths, pngIcons, type AppIcons } from '@protobase/server'

// The deploy bundle's table of contents, read by `protobase serve <dir>` and by any host that serves a bundle.
export const manifestFile = 'protobase.bundle.json'

/**
 * A plugin the bundle carries under `public`: the project's own UI (`app`) or an `--extend` folder's. `path` is its
 * plugin.json inside `public`; `api` and `protobase` are what it is built for, and `fields` the field types it
 * provides with the storage types each shows.
 */
export type BundlePlugin = { name: string; path: string; api: number; protobase: string; fields?: Record<string, string[]> }

/**
 * The prebuilt app the bundle's `public` holds a copy of: the Protobase version and plugin API it is, and the paths
 * that are its files. A host that has a shell of its own serves those paths from it instead, when every plugin of the
 * bundle loads in it.
 */
export type BundleShell = { protobase: string; pluginApi: number; paths: string[] }

export type BundleMobile = { plugins: Record<string, string> }

export type BundleManifest = {
  // The format of this file.
  version: 3
  // The Protobase version of the copies the bundle was built with, the building CLI's in a bundled project and the
  // installed ones in a locked project: the runtime a host serves the bundle on.
  protobase: string
  // The config module for the serve runtime, relative to the bundle.
  server: string
  // The app and its plugins, relative to the bundle.
  public: string
  // Paths the server answers: a path is under a prefix when it equals it or continues it with `/`.
  api: string[]
  // The page, inside `public`, that a navigation to any other path that is no file gets.
  spa: string
  // The plugins the app loads first, in this order.
  plugins: BundlePlugin[]
  // The project's theme inside `public`, which the app links after its own stylesheets; empty without one.
  theme: string
  shell: BundleShell
  // The icons inside `public` that are the project's own rather than Protobase's, which the server's web manifest and
  // `/meta` name. A bundle built before it names none.
  icons?: AppIcons
  // The native packages, name → version, that the bundle's copy of the shell runs on in the mobile app (those
  // @protobase/mobile pins), which the fingerprint of its mobile release names. A bundle built before it names none.
  native?: Record<string, string>
  // With the project's `mobile` section, and only then, what of it the fingerprint of the mobile release names besides
  // `native`: its plugins, name → the spec it gives, empty when it gives none.
  mobile?: BundleMobile
  // The packages the config module loads from disk, native add-ons and what they need: a node_modules folder beside
  // `server`, relative to the bundle. Only in a bundle that has some.
  nodeModules?: string
  // The project's db/migrations/*.sql, which the serve runtime's `migrate` applies, relative to the bundle. Only in a
  // bundle that has some.
  migrations?: string
}

export const isApiPath = (api: readonly string[], pathname: string) =>
  api.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))

// A bundle's API is createAdmin at its default basePath: resources under /api/v1, /meta and the docs beside them,
// Better Auth under /api/auth. The UI calls those paths and the serve runtime refuses another basePath.
export const bundleBasePath = '/api/v1'

// Where `protobase build` puts each part, and the paths that go to the server: the API, and the documents MCP clients
// discover its sign-in by, which answer 404 without MCP rather than the SPA's page.
export const bundleLayout = { server: 'protobase.config.js', public: 'public', spa: 'index.html', api: ['/api', ...oauthWellKnownPaths], theme: 'protobase.theme.css' } as const

// Where `protobase build` puts the packages the config module loads from disk, when there are any.
export const bundleNodeModules = 'node_modules'

// Where `protobase build` puts the project's migrations, when there are any.
export const bundleMigrations = 'migrations'

const isStringList = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string')

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const isFieldTypes = (value: unknown): value is Record<string, string[]> => isObject(value) && Object.values(value).every(isStringList)

const isPlugin = (value: unknown): value is BundlePlugin =>
  isObject(value) &&
  typeof value.name === 'string' &&
  typeof value.path === 'string' &&
  Number.isInteger(value.api) &&
  typeof value.protobase === 'string' &&
  (value.fields === undefined || isFieldTypes(value.fields))

const isShell = (value: unknown): value is BundleShell =>
  isObject(value) && typeof value.protobase === 'string' && Number.isInteger(value.pluginApi) && isStringList(value.paths)

const isVersions = (value: unknown): value is Record<string, string> => isObject(value) && Object.values(value).every((item) => typeof item === 'string')

const isIcons = (value: unknown): value is AppIcons =>
  isObject(value) && typeof value.favicon === 'boolean' && isStringList(value.png) && value.png.every((icon) => icon in pngIcons)

// The bundle's layout; its Protobase version is the host's, to pick the runtime it serves the bundle on.
export type BundleLayout = Omit<BundleManifest, 'protobase'>

export const parseManifest = (value: unknown, file: string): BundleLayout => {
  const manifest = value as Partial<BundleManifest> | null
  if (manifest?.version !== 3) throw new Error(`${file} is not a version 3 bundle manifest; rebuild it with \`protobase build\``)
  const { server, public: publicDir, api, spa, plugins, theme, shell, icons, native, mobile, nodeModules, migrations } = manifest
  if (typeof server !== 'string' || typeof publicDir !== 'string' || typeof spa !== 'string' || typeof theme !== 'string' || !isStringList(api)) {
    throw new Error(`${file} needs server, public, spa and theme paths and an api list`)
  }
  if (!Array.isArray(plugins) || !plugins.every(isPlugin)) throw new Error(`${file} needs a plugins list, each with a name, path, api and protobase`)
  if (!isShell(shell)) throw new Error(`${file} needs a shell with its protobase version, pluginApi and paths`)
  if (icons !== undefined && !isIcons(icons)) throw new Error(`${file} has icons that are not a favicon flag and a list of PNG icons`)
  if (native !== undefined && !isVersions(native)) throw new Error(`${file} has a native that is not a map of package names to versions`)
  if (mobile !== undefined && !(isObject(mobile) && isVersions(mobile.plugins))) throw new Error(`${file} has a mobile that is not { plugins } with a map of package names to versions`)
  if (nodeModules !== undefined && typeof nodeModules !== 'string') throw new Error(`${file} has a nodeModules that is no path`)
  if (migrations !== undefined && typeof migrations !== 'string') throw new Error(`${file} has a migrations that is no path`)
  return {
    version: 3,
    server,
    public: publicDir,
    api,
    spa,
    plugins,
    theme,
    shell,
    ...(icons && { icons }),
    ...(native && { native }),
    ...(mobile && { mobile }),
    ...(nodeModules === undefined ? {} : { nodeModules }),
    ...(migrations === undefined ? {} : { migrations }),
  }
}

export const readManifest = async (bundleDir: string) => {
  const file = path.join(bundleDir, manifestFile)
  return parseManifest(JSON.parse(await readFile(file, 'utf8')), file)
}
