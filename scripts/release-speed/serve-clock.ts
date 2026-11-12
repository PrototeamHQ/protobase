// The release workflow's clock over a run that published: from its start until npm serves the release's @protobase
// packages, the moment they can be installed. Each image leg waits for that in its npm-wait step (image.yml), so the
// earliest of those steps to complete marks it. The images get a figure of their own: from the run's first job to its
// last but the report job.
import { reportJob, runTimings, seconds, type ApiJob, type ApiRun, type RunTimings } from './timings'

/** The step of each image leg that waits for npm to serve the packages, in a job named `image / ...` or `image-dev / ...`. */
export const npmWaitStep = 'Wait for npm to serve the @protobase packages'

const isImageLeg = (job: ApiJob) => /^image(-dev)? \//.test(job.name)

/** Whether a run published the packages: its `publish` job succeeded. */
export const published = (jobs: ApiJob[]) => jobs.some((job) => job.name === 'publish' && job.conclusion === 'success')

/** When npm served the packages: the earliest completed npm-wait step of the image legs. */
export const servedAt = (run: ApiRun, jobs: ApiJob[]) => {
  const ends = jobs
    .filter(isImageLeg)
    .flatMap((job) => job.steps ?? [])
    .filter((step) => step.name === npmWaitStep && step.conclusion === 'success' && step.completed_at)
    .map((step) => step.completed_at as string)
  // A successful run that published runs every image leg, so a run without the step means the workflow changed.
  if (ends.length === 0) throw new Error(`release run ${run.id} published, but no image leg completed its "${npmWaitStep}" step`)
  return ends.sort()[0] as string
}

/** From a run's first job's creation to its last job's completion, the report job left out. */
export const imagesWall = (run: ApiRun, jobs: ApiJob[]) => {
  const ran = jobs.filter((job) => job.name !== reportJob)
  const first = ran.map((job) => job.created_at).sort()[0]
  const last = ran.map((job) => job.completed_at ?? run.updated_at).sort().at(-1)
  if (!first || !last) throw new Error(`release run ${run.id} has no jobs`)
  return seconds(first, last)
}

export const serveTimings = (run: ApiRun, jobs: ApiJob[]): RunTimings => {
  const timings = runTimings(run, jobs)
  const wall = seconds(run.run_started_at, servedAt(run, jobs))
  return { ...timings, wall, run: wall - timings.queue, images: imagesWall(run, jobs) }
}
