import { statSync } from 'node:fs'
import path from 'node:path'
import pg from 'pg'
import { checkJobsSchema, configExports, isCaptured, startJobs } from '@protobase/server'
import { buildProject, type AppDatabase } from '../config/build-project'
import type { MergedConfig } from '../config/merge-config'
import { projectAdmin } from '../project/project-admin'
import { readManifest } from '../bundle/manifest'
import { openAppDatabase } from '../project/pg-db'
import { checkBundleManifest } from '../serve/bundle-manifest'
import { loadBundle } from '../serve/load-bundle'

// The config module of a bundle from `protobase build`, given its folder or the module itself.
export const bundleConfigFile = async (bundle: string) => {
  if (!statSync(bundle).isDirectory()) return bundle
  return path.join(bundle, (await readManifest(bundle)).server)
}

export type WorkerOptions = {
  /** The bundle's config, read with this process's environment (`loadBundle`). */
  config: MergedConfig
  databaseUrl?: string
  // How the app's database is opened; tests replace it.
  openDb?: (url: string) => AppDatabase
}

/**
 * Runs the project's jobs, and nothing else, until `stop`: the same handlers `protobase serve` runs, in a process of
 * their own, built from the config the same way. It reads the jobs schema at start and refuses one that is missing or
 * behind, like `serve`.
 */
export const startWorker = async ({ config, databaseUrl, openDb = (url) => openAppDatabase(pg, url) }: WorkerOptions) => {
  if (!databaseUrl) throw new Error('No database: set DATABASE_URL')
  const database = openDb(databaseUrl)
  const { db } = database
  const start = async () => {
    const project = await buildProject(config, database)
    // Events and history are captured, mentions in comments mailed and AI fields filled by Protobase's own jobs.
    const builtIn = configExports(project.config).resources.some((resource) => {
      const model = resource.toModel()
      return isCaptured(model) || model.comments || Object.values(model.fields).some((field) => field.ai)
    })
    if (project.jobs.length === 0 && !builtIn) throw new Error('The bundle has no jobs: name their module in protobase.config.ts as `jobs`, or give a resource events, history, comments or an AI field')
    const { jobs: definitions } = projectAdmin(project, db)
    await checkJobsSchema(db)
    return { definitions, runtime: await startJobs({ db, jobs: definitions, onError: (error) => console.error(error) }) }
  }
  const { definitions, runtime: jobs } = await start().catch(async (error: Error) => {
    await db.destroy()
    throw error
  })
  return {
    jobs: definitions.length,
    // Lets running jobs finish, then drains the pool it opened.
    stop: async () => {
      await jobs.stop()
      await db.destroy()
    },
  }
}

/** `protobase worker <bundle>`: the bundle's jobs until SIGTERM or SIGINT. */
export const loadWorkerBundle = async (bundle: string) => {
  const file = await bundleConfigFile(bundle)
  checkBundleManifest(file)
  return loadBundle(file)
}
