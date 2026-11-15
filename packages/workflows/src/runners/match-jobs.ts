/**
 * What a runner says of itself with each claim: its platform, the kinds of steps it runs and its labels, its free
 * slots, the steps whose images it holds (by step version, `custom:<name>:<version>`, until images have digests), each
 * with whether a snapshot of it is ready, and its warm instances with their free concurrency.
 */
export type RunnerState = {
  platform: string
  kinds: string[]
  labels: string[]
  capacity: { slots: number }
  images: { step: string; snapshot?: boolean }[]
  instances: { step: string; free: number }[]
}

/** A runner holding a claim open, of a tenant, with its labels as its record sets them and the state it sent. */
export type PollingRunner = { id: string; tenant: string | null; labels: string[]; state: RunnerState; polledAt: Date }

/** A job waiting for a runner: its step, since when it is queued, and since when a pass first left it for a better runner. */
export type QueuedJob = { id: string; tenant: string | null; step: string; labels?: string[]; queuedAt: Date; passedOverAt: Date | null }

/**
 * A runner of a tenant that holds a claim open or runs a job, free or busy, with what it said of itself last: one a job
 * may wait for.
 */
export type KnownRunner = { tenant: string | null; state: RunnerState }

/** How long a job waits for a runner better than the best one free: one with its image, and one with a warm instance. */
export type MatchSettings = { coldWaitMs: number; warmWaitMs: number }

/** How hot a runner is for a job: 1 a warm instance with room, 2 a snapshot, 3 the image, 4 nothing of it. */
export type Tier = 1 | 2 | 3 | 4

export type Placement = { job: string; runner: string; tier: Tier }

/** The kind of step a runner must run for a custom step's job: all custom steps are containers. */
export const jobKind = 'container'

/** How hot `runner` is for a job of `step`. */
export const tierOf = (state: RunnerState, step: string): Tier => {
  if (state.instances.some((instance) => instance.step === step && instance.free > 0)) return 1
  const image = state.images.find((one) => one.step === step)
  if (image?.snapshot) return 2
  return image ? 3 : 4
}

// Whether a runner has anything of a step's image, a warm instance of it included, and whether it has a warm instance,
// with room or not.
const holdsImage = (state: RunnerState, step: string) => state.images.some((image) => image.step === step) || holdsInstance(state, step)
const holdsInstance = (state: RunnerState, step: string) => state.instances.some((instance) => instance.step === step)

// Whether a runner may take a job at all: of the job's tenant, running containers, with a free slot and every label the
// job needs.
const fits = (runner: PollingRunner, job: QueuedJob) => {
  if (runner.tenant !== job.tenant) return false
  if (!runner.state.kinds.includes(jobKind) || runner.state.capacity.slots < 1) return false
  const labels = new Set([...runner.labels, ...runner.state.labels])
  return (job.labels ?? []).every((label) => labels.has(label))
}

// The jobs in the order they take their pick: oldest first within a tenant, and the tenants by turns, the one whose
// oldest job waits longest first, so a flood of one tenant's jobs never holds back another's.
const roundRobin = (jobs: readonly QueuedJob[]) => {
  const byTenant = new Map<string | null, QueuedJob[]>()
  for (const job of [...jobs].sort((a, b) => a.queuedAt.getTime() - b.queuedAt.getTime())) byTenant.set(job.tenant, [...(byTenant.get(job.tenant) ?? []), job])
  const queues = [...byTenant.values()]
  const ordered: QueuedJob[] = []
  for (let turn = 0; ordered.length < jobs.length; turn++) for (const queue of queues) if (queue[turn]) ordered.push(queue[turn]!)
  return ordered
}

/**
 * Which jobs go to which of the runners holding a claim open, each runner taking one, and which jobs a pass left for a
 * better runner for the first time (`passedOver`), whose wait counts from now. Each job takes the hottest runner that
 * fits it, by `tierOf`, the one that has waited longest among equals; but one whose best is a runner without its image
 * waits up to `coldWaitMs` for one with it, and one whose best has its image waits up to `warmWaitMs` for a warm
 * instance, each counted from when a pass first left it, before it takes the best that is free. It waits only while a
 * runner of its tenant it would wait for is `known`, busy or not; with none it takes the best free at once. A job left
 * waiting leaves its runner to the jobs after it.
 */
export const matchJobs = ({ jobs, runners, known, now, settings }: { jobs: readonly QueuedJob[]; runners: readonly PollingRunner[]; known: readonly KnownRunner[]; now: Date; settings: MatchSettings }) => {
  const free = [...runners].sort((a, b) => a.polledAt.getTime() - b.polledAt.getTime())
  const placements: Placement[] = []
  const passedOver: string[] = []
  for (const job of roundRobin(jobs)) {
    const fitting = free.filter((runner) => fits(runner, job))
    if (fitting.length === 0) continue
    const ranked = fitting.map((runner) => ({ runner, tier: tierOf(runner.state, job.step) })).sort((a, b) => a.tier - b.tier)
    const best = ranked[0]!
    const waited = job.passedOverAt ? now.getTime() - job.passedOverAt.getTime() : 0
    const tenants = known.filter((runner) => runner.tenant === job.tenant)
    const hotter = best.tier === 4 ? tenants.some((runner) => holdsImage(runner.state, job.step)) : best.tier !== 1 && tenants.some((runner) => holdsInstance(runner.state, job.step))
    const waits = hotter && waited < (best.tier === 4 ? settings.coldWaitMs : settings.warmWaitMs)
    if (waits) {
      if (!job.passedOverAt) passedOver.push(job.id)
      continue
    }
    placements.push({ job: job.id, runner: best.runner.id, tier: best.tier })
    free.splice(free.indexOf(best.runner), 1)
  }
  return { placements, passedOver }
}
