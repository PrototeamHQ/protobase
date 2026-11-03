// The wall, queue and run time of a workflow run and of each of its jobs, in seconds, from the GitHub Actions API's
// run and jobs. A run's queue is the wait from its start to its first job's start; a job's is the wait from its
// creation to its start, for a runner or behind the release workflow's concurrency group. Only jobs that succeeded
// count: a skipped job did not run. The release workflow's last job starts the report (release-speed.yml), and its
// queue and run time are not part of the release: a run that has it ends at its last other job, a run without it at
// its `updated_at`.

export interface ApiRun {
  id: number
  event: string
  run_started_at: string
  updated_at: string
  html_url: string
}

export interface ApiJob {
  name: string
  conclusion: string | null
  created_at: string
  started_at: string
  completed_at: string | null
}

export interface Timing {
  wall: number
  queue: number
  run: number
}

export interface RunTimings extends Timing {
  id: number
  url: string
  jobs: Map<string, Timing>
}

const seconds = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / 1000

export const jobTiming = (job: ApiJob): Timing => {
  if (!job.completed_at) throw new Error(`job ${job.name} has not completed`)
  const queue = seconds(job.created_at, job.started_at)
  const run = seconds(job.started_at, job.completed_at)
  return { wall: queue + run, queue, run }
}

/** The name of the release workflow's job that starts the report. */
export const reportJob = 'release-speed'

/** When a run's work ended: its last job but the report job when it has one, else when GitHub last updated it. */
export const runEnd = (run: ApiRun, jobs: ApiJob[]) => {
  if (!jobs.some((job) => job.name === reportJob)) return run.updated_at
  const ends = jobs.filter((job) => job.name !== reportJob).map((job) => job.completed_at ?? run.updated_at)
  return ends.sort().at(-1) ?? run.updated_at
}

export const runTimings = (run: ApiRun, apiJobs: ApiJob[]): RunTimings => {
  const jobs = apiJobs.filter((job) => job.name !== reportJob)
  const ran = jobs.filter((job) => job.conclusion === 'success')
  const wall = seconds(run.run_started_at, runEnd(run, apiJobs))
  const firstStart = ran.map((job) => job.started_at).sort()[0]
  const queue = firstStart ? Math.max(0, seconds(run.run_started_at, firstStart)) : 0
  return {
    id: run.id,
    url: run.html_url,
    wall,
    queue,
    run: wall - queue,
    jobs: new Map(ran.map((job) => [job.name, jobTiming(job)])),
  }
}
