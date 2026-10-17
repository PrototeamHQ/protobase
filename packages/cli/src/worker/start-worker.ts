import { statSync } from 'node:fs'
import path from 'node:path'
import pg from 'pg'
import type { Db } from '@protobase/query'
import { checkJobsSchema, configExports, isCaptured, jobDefinitions, startJobs } from '@protobase/server'
import { projectAdmin } from '../project/project-admin'
import { readManifest } from '../bundle/manifest'
import { createPgDb } from '../project/pg-db'
import { checkBundleVersion } from '../serve/bundle-version'
import { loadBundle, type ServedProject } from '../serve/load-bundle'

// The config module of a bundle from `protobase build`, given its folder or the module itself.
export const bundleConfigFile = async (bundle: string) => {
  if (!statSync(bundle).isDirectory()) return bundle
  return path.join(bundle, (await readManifest(bundle)).server)
}

export type WorkerOptions = {
  project: ServedProject
  databaseUrl?: string
  // How the pool is created when the project exports no `db`; tests replace it.
  createDb?: (url: string) => Db
}

/**
 * Runs the project's jobs, and nothing else, until `stop`: the same handlers `protobase serve` runs, in a process of
 * their own. It reads the jobs schema at start and refuses one that is missing or behind, like `serve`.
 */
export const startWorker = async ({ project, databaseUrl, createDb = (url) => createPgDb(pg, url) }: WorkerOptions) => {
  const captured = configExports(project.config).resources.some((resource) => isCaptured(resource.toModel()))
  if (jobDefinitions(project.jobs ?? {}).length === 0 && !captured) throw new Error('The bundle has no jobs: export them from protobase.config.ts as `jobs`, or give a resource events or history')
  if (!project.db && !databaseUrl) throw new Error('No database: set DATABASE_URL or export `db` from protobase.config.ts')
  const ownDb = project.db ? undefined : createDb(databaseUrl!)
  const db = project.db ?? ownDb!
  const start = async () => {
    const { jobs: definitions } = projectAdmin(project, project.config, db)
    await checkJobsSchema(db)
    return { definitions, runtime: await startJobs({ db, jobs: definitions, onError: (error) => console.error(error) }) }
  }
  const { definitions, runtime: jobs } = await start().catch(async (error: Error) => {
    await ownDb?.destroy()
    throw error
  })
  return {
    jobs: definitions.length,
    // Lets running jobs finish, then drains the pool it created; a `db` the project exports stays the project's.
    stop: async () => {
      await jobs.stop()
      await ownDb?.destroy()
    },
  }
}

/** `protobase worker <bundle>`: the bundle's jobs until SIGTERM or SIGINT, once its manifest shows a version this CLI runs. */
export const loadWorkerBundle = async (bundle: string) => {
  const file = await bundleConfigFile(bundle)
  await checkBundleVersion(file)
  return loadBundle(file)
}
