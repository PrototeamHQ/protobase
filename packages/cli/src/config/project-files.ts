import { existsSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { conventionConfig } from '../project/convention'
import { uiDirs } from '../project/convention-files'
import { functionFiles } from '../project/functions-folder'
import type { ImportModules } from './read-config'

type Module = Record<string, unknown>

/**
 * The project's code the framework finds by its path, beside the config: in a project's folder, or as a bundle
 * carries it. Each loads only when asked for.
 */
export type ProjectFiles = {
  /** The resources, views and pages: config/index.ts with every config/<dir>/ui.ts; `undefined` without config/index.ts. */
  resources?: () => Promise<Module>
  /** The API functions: one per file in ./functions, each its file's default export. */
  functions: Record<string, () => Promise<Module>>
  /** One file by its path in the project, such as `jobs/send-invoice.ts`; `undefined` when there is none. */
  module: (file: string) => (() => Promise<Module>) | undefined
  /** A package the config names, such as `sharp` for `files.images`, from the project's dependencies. */
  package: (name: string) => Promise<Module>
}

/** The files the conventions name besides resources and functions, which a bundle carries for its serve runtime. */
export const conventionModules = (projectDir: string) => {
  const inFolder = (folder: string) =>
    existsSync(path.join(projectDir, folder)) ? readdirSync(path.join(projectDir, folder)).filter((name) => name.endsWith('.ts') && !/\.(test|d)\.ts$/.test(name)).map((name) => `${folder}/${name}`) : []
  const files = ['auth/hooks.ts', 'auth/authenticate.ts', 'auth/mailer.ts', 'config/roles.ts', 'assistant/tools.ts', 'audit/queue.ts', 'webhooks/owner-roles.ts', 'notifications/store.ts', 'notifications/history-store.ts', 'notifications/senders.ts']
  return [...inFolder('jobs'), ...inFolder('hooks'), ...inFolder('files'), ...files.filter((file) => existsSync(path.join(projectDir, file)))].sort()
}

/** The code in the project's folder `projectDir`, loaded with `importModules`. */
export const sourceFiles = (projectDir: string, importModules: ImportModules): ProjectFiles => {
  const configDir = path.join(projectDir, 'config')
  const index = path.join(configDir, 'index.ts')
  const one = (file: string) => async () => (await importModules([file]))[0]!
  return {
    ...(existsSync(index) && {
      resources: async () => {
        const dirs = uiDirs(configDir)
        const [indexExports, ...ui] = await importModules([index, ...dirs.map((dir) => path.join(configDir, dir, 'ui.ts'))])
        return conventionConfig(indexExports!, dirs.map((dir, i): [string, Module] => [dir, ui[i]!]))
      },
    }),
    functions: Object.fromEntries(functionFiles(projectDir).map(({ name, file }) => [name, one(file)])),
    module: (file) => (existsSync(path.join(projectDir, file)) ? one(path.join(projectDir, file)) : undefined),
    package: (name) => import(/* @vite-ignore */ pathToFileURL(createRequire(path.join(projectDir, 'package.json')).resolve(name)).href),
  }
}
