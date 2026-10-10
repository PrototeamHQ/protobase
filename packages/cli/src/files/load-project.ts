import { existsSync, statSync } from 'node:fs'
import path from 'node:path'
import pg from 'pg'
import { configExports, type ProjectConfig } from '@protobase/server'
import { readManifest } from '../bundle/manifest'
import { loadNearestEnvFile } from '../dev/env'
import { createPgDb } from '../project/pg-db'
import { importProjectFile } from '../project/import-project-file'
import { loadBundle } from '../serve/load-bundle'

// A bundle from `protobase build`: its folder or its config module.
const bundleProject = async (bundle: string): Promise<ProjectConfig> => {
  if (!statSync(bundle).isDirectory()) return loadBundle(bundle)
  const manifest = await readManifest(bundle)
  return loadBundle(path.join(bundle, manifest.server))
}

// The project in `dir` as `protobase dev` reads it: protobase.config.ts, and config/index.ts when that has no `config`.
const sourceProject = async (dir: string): Promise<ProjectConfig> => {
  const file = path.join(dir, 'protobase.config.ts')
  const custom = existsSync(file) ? (((await importProjectFile(file)).default ?? {}) as ProjectConfig) : {}
  if (custom.config) return custom
  const index = path.join(dir, 'config', 'index.ts')
  if (!existsSync(index)) throw new Error(`No config/index.ts or protobase.config.ts in ${dir}; run this inside a project, or name a bundle`)
  return { ...custom, config: await importProjectFile(index) }
}

/**
 * What a command over a project's files needs: its resources, its files options and a database, from a bundle or from
 * the project in `dir`. `close` ends the pool it opened; a `db` the project exports stays the project's.
 */
export const loadFilesProject = async (bundle: string | undefined, dir: string) => {
  loadNearestEnvFile(dir)
  const project = bundle ? await bundleProject(bundle) : await sourceProject(dir)
  const url = process.env.DATABASE_URL
  if (!project.db && !url) throw new Error('No database: set DATABASE_URL or export `db` from protobase.config.ts')
  const ownDb = project.db ? undefined : createPgDb(pg, url!)
  return {
    resources: configExports(project.config ?? {}).resources,
    db: project.db ?? ownDb!,
    ...(project.files && { files: project.files }),
    close: async () => {
      await ownDb?.destroy()
    },
  }
}
