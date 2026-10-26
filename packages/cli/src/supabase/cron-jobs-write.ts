import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { configWithJobs } from './config-jobs'
import { cronJobDeclaration, cronJobModule } from './cron-job-file'
import type { ConvertedCronJob, CronJobToWrite } from './cron-plan'

const jobFile = (projectDir: string, job: ConvertedCronJob) => path.join(projectDir, 'jobs', `${job.file}.ts`)

/** The files of `jobs` that the project has already, which the import does not overwrite. */
export const cronJobFilesInTheWay = (projectDir: string, jobs: ConvertedCronJob[]) =>
  jobs.map((job) => jobFile(projectDir, job)).filter((file) => existsSync(file))

const readIfThere = async (file: string) => (existsSync(file) ? readFile(file, 'utf8') : undefined)

/**
 * Writes each job's run in `jobs/<name>.ts` and declares the jobs in protobase.config.ts's `jobs`; returns whether the
 * config does, `false` when it cannot add them, for a person to add them to.
 */
export const writeCronJobs = async (projectDir: string, jobs: CronJobToWrite[]) => {
  if (jobs.length === 0) return true
  const configFile = path.join(projectDir, 'protobase.config.ts')
  const existing = await readIfThere(configFile)
  const config = configWithJobs(existing, jobs.map((job) => job.file), jobs.map(cronJobDeclaration))
  await mkdir(path.join(projectDir, 'jobs'), { recursive: true })
  for (const job of jobs) await writeFile(jobFile(projectDir, job), cronJobModule(job), { flag: 'wx' })
  if (config === undefined) return false
  if (config !== existing) await writeFile(configFile, config)
  return true
}
