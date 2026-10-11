import { existsSync } from 'node:fs'
import path from 'node:path'
import pg from 'pg'
import { configExports, mergeConfig, type ProjectConfig } from '@protobase/server'
import { loadNearestEnvFile } from '../dev/env'
import type { Extension } from '../project/extensions'
import { importProjectFile } from '../project/import-project-file'
import { createPgDb } from '../project/pg-db'

const configOf = async (file: string): Promise<ProjectConfig> => ((await importProjectFile(file)).default ?? {}) as ProjectConfig

/**
 * The project in `dir` as `protobase dev` merges it, for what its database needs: protobase.config.ts, or
 * config/index.ts when that has no `config`, after the configs of `extensions` and the configs it extends. `close`
 * ends the pool it opened; a `db` the project exports stays the project's.
 */
export const loadMigrationProject = async (dir: string, extensions: Extension[] = []) => {
  loadNearestEnvFile(dir)
  const file = path.join(dir, 'protobase.config.ts')
  const custom = existsSync(file) ? await configOf(file) : {}
  const index = path.join(dir, 'config', 'index.ts')
  if (!custom.config && !existsSync(index)) throw new Error(`No config/index.ts or protobase.config.ts in ${dir}; run this inside a project`)
  const own = { ...custom, config: custom.config ?? (await importProjectFile(index)) }
  const extended = await Promise.all(extensions.flatMap((extension) => (extension.config ? [configOf(extension.config)] : [])))
  const project = mergeConfig(...extended, own)
  const url = process.env.DATABASE_URL
  if (!project.db && !url) throw new Error('No database: set DATABASE_URL or export `db` from protobase.config.ts')
  const ownDb = project.db ? undefined : createPgDb(pg, url!)
  return {
    models: configExports(project.config ?? {}).resources.map((source) => source.toModel()),
    db: project.db ?? ownDb!,
    ...(project.auth && { auth: project.auth }),
    ...(project.events && { events: project.events }),
    close: async () => {
      await ownDb?.destroy()
    },
  }
}

export type MigrationProject = Awaited<ReturnType<typeof loadMigrationProject>>
