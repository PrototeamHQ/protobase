import { readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { mergeConfig, type ProjectConfig } from '@protobase/server'
import { conventionConfig } from '../project/convention'
import type { Extension } from '../project/extensions'
import { sharedDb } from './create-db'

export type Project = ProjectConfig & { exports: Record<string, unknown> }

// Vite serves absolute files under /@fs, which keeps them in the module graph (and so hot reloadable).
const load = (file: string): Promise<Record<string, any>> => import(/* @vite-ignore */ `/@fs${file}`)

const conventionExports = async (projectDir: string) => {
  const configDir = path.join(projectDir, 'config')
  const index = path.join(configDir, 'index.ts')
  if (!existsSync(index)) throw new Error(`No config/index.ts in ${projectDir}; run \`protobase scaffold\` or add a protobase.config.ts`)
  const indexExports = await load(index)
  const dirs = (await readdir(configDir, { withFileTypes: true })).filter((entry) => entry.isDirectory())
  const uiModules: Array<[string, Record<string, unknown>]> = []
  for (const { name } of dirs) {
    const ui = path.join(configDir, name, 'ui.ts')
    if (existsSync(ui)) uiModules.push([name, await load(ui)])
  }
  return conventionConfig(indexExports, uiModules)
}

// Each config is named in merge errors by its own name, otherwise by its file.
const named = (config: ProjectConfig, file: string) => ({ ...config, name: config.name ?? file })

// protobase.config.ts, with the convention's config when it has none, merged after the extensions' configs and with the
// configs it extends, as `protobase build` merges them.
export const loadProject = async (projectDir: string, extensions: Extension[] = []): Promise<Project> => {
  const file = path.join(projectDir, 'protobase.config.ts')
  const custom: ProjectConfig = existsSync(file) ? ((await load(file)).default ?? {}) : {}
  const extended: ProjectConfig[] = []
  for (const extension of extensions) if (extension.config) extended.push(named((await load(extension.config)).default ?? {}, extension.config))
  const own = named({ ...custom, config: custom.config ?? (await conventionExports(projectDir)) }, existsSync(file) ? 'protobase.config.ts' : 'config/index.ts')
  const project = mergeConfig(...extended, own)
  return { ...project, exports: project.config ?? {} }
}

export const projectDb = (project: Project, projectDir: string) => {
  if (project.db) return project.db
  const url = process.env.PROTOBASE_DATABASE_URL
  if (!url) throw new Error('No database: set DATABASE_URL (or pass --env) or export `db` from protobase.config.ts')
  return sharedDb(projectDir, url)
}
