import { readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import type { ProjectConfig } from '../project/config'
import { conventionConfig } from '../project/convention'
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

export const loadProject = async (projectDir: string): Promise<Project> => {
  const file = path.join(projectDir, 'protobase.config.ts')
  const custom: ProjectConfig = existsSync(file) ? ((await load(file)).default ?? {}) : {}
  return { ...custom, exports: custom.config ?? (await conventionExports(projectDir)) }
}

export const projectDb = (project: Project, projectDir: string) => {
  if (project.db) return project.db
  const url = process.env.PROTOBASE_DATABASE_URL
  if (!url) throw new Error('No database: set DATABASE_URL (or pass --env) or export `db` from protobase.config.ts')
  return sharedDb(projectDir, url)
}
