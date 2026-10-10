import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Authenticator, ProjectConfig } from '@protobase/server'
import { bundleBasePath } from '../bundle/manifest'

export type ServedProject = ProjectConfig & { config: Record<string, unknown>; authenticate: Authenticator }

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

// Checks the default export of a bundle written by `protobase build`.
export const servedProject = (module: Record<string, unknown>, file: string): ServedProject => {
  const project = module.default
  if (!isObject(project)) throw new Error(`${file} has no default export; build it with \`protobase build\``)
  if (!isObject(project.config)) throw new Error(`${file} has no \`config\`: export it from protobase.config.ts or add config/index.ts`)
  if (typeof project.authenticate !== 'function') {
    throw new Error('No authenticator: export `authenticate` (and `auth`) from protobase.config.ts; see https://docs.protobase.net/reference/auth/')
  }
  const basePath = isObject(project.options) ? project.options.basePath : undefined
  if (basePath !== undefined && basePath !== bundleBasePath) {
    throw new Error(`options.basePath is ${JSON.stringify(basePath)}; a bundle's UI and manifest expect the API at ${bundleBasePath}, so remove it (see https://docs.protobase.net/reference/cli/#the-manifest)`)
  }
  return project as ServedProject
}

export const loadBundle = async (file: string): Promise<ServedProject> =>
  servedProject(await import(pathToFileURL(path.resolve(file)).href), file)
