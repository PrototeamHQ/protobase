import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { ensureExports } from '../scaffold/index-file'
import { configWithJobs } from './config-jobs'
import { cronJobModule } from './cron-job-file'
import type { ConvertedCronJob, CronJobToWrite } from './cron-plan'

const jobFile = (projectDir: string, job: ConvertedCronJob) => path.join(projectDir, 'jobs', `${job.file}.ts`)

/** The files of `jobs` that the project has already, which the import does not overwrite. */
export const cronJobFilesInTheWay = (projectDir: string, jobs: ConvertedCronJob[]) =>
  jobs.map((job) => jobFile(projectDir, job)).filter((file) => existsSync(file))

const readIfThere = async (file: string) => (existsSync(file) ? readFile(file, 'utf8') : undefined)

/**
 * Writes each job's module in `jobs/`, exports it from `jobs/index.ts` and passes them as protobase.config.ts's `jobs`;
 * returns whether the config does, `false` when it has a `jobs` of its own for a person to add them to.
 */
export const writeCronJobs = async (projectDir: string, jobs: CronJobToWrite[]) => {
  if (jobs.length === 0) return true
  await mkdir(path.join(projectDir, 'jobs'), { recursive: true })
  for (const job of jobs) await writeFile(jobFile(projectDir, job), cronJobModule(job), { flag: 'wx' })
  const index = path.join(projectDir, 'jobs', 'index.ts')
  await writeFile(index, ensureExports((await readIfThere(index)) ?? '', jobs.map((job) => ({ from: `./${job.file}`, names: [job.exportName] }))))
  const configFile = path.join(projectDir, 'protobase.config.ts')
  const existing = await readIfThere(configFile)
  const config = configWithJobs(existing)
  if (config === undefined) return false
  if (config !== existing) await writeFile(configFile, config)
  return true
}
