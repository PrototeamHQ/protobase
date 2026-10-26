import { statSync } from 'node:fs'
import path from 'node:path'
import pg from 'pg'
import { configExports } from '@protobase/server'
import { readManifest } from '../bundle/manifest'
import type { MergedConfig } from '../config/merge-config'
import { projectFiles, projectResources } from '../config/project-parts'
import { loadSourceConfig } from '../config/source-config'
import { loadNearestEnvFile } from '../dev/env'
import { createPgDb } from './pg-db'
import { loadBundle } from '../serve/load-bundle'

// A bundle from `protobase build`: its folder or its config module.
const bundleConfig = async (bundle: string): Promise<MergedConfig> => {
  if (!statSync(bundle).isDirectory()) return loadBundle(bundle, 'tool')
  const manifest = await readManifest(bundle)
  return loadBundle(path.join(bundle, manifest.server), 'tool')
}

/**
 * What a command over a project's data needs: its resources, its files and events options and a database, from a bundle
 * or from the project in `dir`. `close` ends the pool it opened.
 */
export const loadBundleProject = async (bundle: string | undefined, dir: string) => {
  loadNearestEnvFile(dir)
  const config = bundle ? await bundleConfig(bundle) : await loadSourceConfig(dir, { command: 'tool' })
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('No database: set DATABASE_URL')
  const [resources, files] = await Promise.all([projectResources(config), projectFiles(config)])
  const db = createPgDb(pg, url)
  return {
    resources: configExports(resources).resources,
    db,
    ...(files && { files }),
    ...(config.events && { events: config.events }),
    close: async () => {
      await db.destroy()
    },
  }
}
