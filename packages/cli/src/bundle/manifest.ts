import { readFile } from 'node:fs/promises'
import path from 'node:path'

// The deploy bundle's table of contents, read by `protobase serve <dir>` and by any host that serves a bundle.
export const manifestFile = 'protobase.bundle.json'

export type BundleManifest = {
  // The format of this file.
  version: 2
  // The Protobase version that built the bundle, which the serve runtime checks before loading it (see
  // src/version/compatibility.ts).
  protobase: string
  // The config module for the serve runtime, relative to the bundle.
  server: string
  // The built admin UI, relative to the bundle.
  public: string
  // Paths the server answers: a path is under a prefix when it equals it or continues it with `/`.
  api: string[]
  // The page, inside `public`, that a navigation to any other path that is no file gets.
  spa: string
  // The packages the config module loads from disk, native add-ons and what they need: a node_modules folder beside
  // `server`, relative to the bundle. Only in a bundle that has some.
  nodeModules?: string
}

export const isApiPath = (api: readonly string[], pathname: string) =>
  api.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))

// A bundle's API is createAdmin at its default basePath: resources under /api/v1, /meta and the docs beside them,
// Better Auth under /api/auth. The UI calls those paths and the serve runtime refuses another basePath.
export const bundleBasePath = '/api/v1'

// Where `protobase build` puts each part, and the paths that go to the server.
export const bundleLayout = { server: 'protobase.config.js', public: 'public', spa: 'index.html', api: ['/api'] } as const

// Where `protobase build` puts the packages the config module loads from disk, when there are any.
export const bundleNodeModules = 'node_modules'

const isStringList = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string')

// The bundle's layout; its Protobase version is the serve runtime's to check (see checkBundleVersion).
export type BundleLayout = Omit<BundleManifest, 'protobase'>

export const parseManifest = (value: unknown, file: string): BundleLayout => {
  const manifest = value as Partial<BundleManifest> | null
  if (manifest?.version !== 2) throw new Error(`${file} is not a version 2 bundle manifest; rebuild it with \`protobase build\``)
  const { server, public: publicDir, api, spa, nodeModules } = manifest
  if (typeof server !== 'string' || typeof publicDir !== 'string' || typeof spa !== 'string' || !isStringList(api)) {
    throw new Error(`${file} needs server, public and spa paths and an api list`)
  }
  if (nodeModules !== undefined && typeof nodeModules !== 'string') throw new Error(`${file} has a nodeModules that is no path`)
  return { version: 2, server, public: publicDir, api, spa, ...(nodeModules === undefined ? {} : { nodeModules }) }
}

export const readManifest = async (bundleDir: string) => {
  const file = path.join(bundleDir, manifestFile)
  return parseManifest(JSON.parse(await readFile(file, 'utf8')), file)
}
