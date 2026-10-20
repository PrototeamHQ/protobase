import type { CronJob } from './source-facts'

/** A pg_cron job made a Protobase recurring job: its name, the file in `jobs/` and the export that declare it. */
export type ConvertedCronJob = { name: string; file: string; exportName: string; timezone: string | undefined }

export type CronOutcome = { kind: 'rescheduled' } | ({ kind: 'converted' } & ConvertedCronJob) | { kind: 'left'; reason: string }

export type PlannedCronJob = CronJob & { outcome: CronOutcome }

/** The project's database's features, as the import plan found them, that decide which schemas a converted job may call. */
export type CronTarget = { httpSent: boolean; webhooks: boolean; vault: boolean; queues: boolean }

/** Schemas of the platform's services, which no database but Supabase's has, so a job calling them cannot run elsewhere. */
const platformOnly = ['cron', 'realtime', '_realtime', 'graphql', 'graphql_public', 'pgsodium', 'supabase_migrations', '_analytics', 'pgbouncer']

/** The schemas a job converted for the project's database cannot call: the platform's, and the extensions it lacks. */
export const unavailableSchemas = (target: CronTarget) => [
  ...platformOnly,
  ...(target.httpSent ? [] : ['net']),
  ...(target.webhooks ? [] : ['supabase_functions']),
  ...(target.vault ? [] : ['vault']),
  ...(target.queues ? [] : ['pgmq']),
]

/** The schemas of `schemas` that `command` names an object of, as `schema.name` or `"schema".name`. */
export const calledSchemas = (command: string, schemas: string[]) =>
  schemas.filter((schema) => new RegExp(`(^|[^\\w$."])"?${schema}"?\\s*\\.\\s*["\\w]`, 'i').test(command))

/** Time zones that are pg_cron's default, which a Protobase job reads its schedule in too. */
const utc = new Set(['GMT', 'UTC', 'Etc/UTC', 'Etc/GMT'])

/** A pg_cron job name as a Protobase job name: letters, digits, `_`, `-`, `.` and `/`, the rest made `-`. */
const jobName = (job: CronJob) => (job.name ?? `cron-job-${job.id}`).replace(/[^\w.\-/]+/g, '-')

const fileName = (name: string) =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'cron-job'

/** Words a module's export may not be named, which a job named so gets `cron` before. */
const reserved = new Set(['await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do', 'else', 'enum', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if', 'import', 'in', 'instanceof', 'let', 'new', 'null', 'return', 'static', 'super', 'switch', 'this', 'throw', 'true', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield'])

const exportName = (file: string) => {
  const camel = file.replace(/-([a-z0-9])/g, (_, letter: string) => letter.toUpperCase())
  return /^[0-9]/.test(camel) || reserved.has(camel) ? `cron${camel[0]!.toUpperCase()}${camel.slice(1)}` : camel
}

/** `wanted`, or with `-<id>` after it when `taken` has it already, which it then holds. */
const unique = (taken: Set<string>, wanted: string, id: number, separator = '-') => {
  const name = taken.has(wanted) ? `${wanted}${separator}${id}` : wanted
  taken.add(name)
  return name
}

/** Why a job is not converted for a database without pg_cron, or `undefined` when it can be. */
const leftReason = (job: CronJob, options: CronPlanOptions) => {
  if (!job.active) return 'inactive on Supabase, so not converted'
  const called = calledSchemas(job.command, unavailableSchemas(options.target))
  if (called.length > 0) return `calls ${called.join(', ')}, which the project's database lacks: rewrite it as a Protobase job`
  const zone = utc.has(options.timezone) ? 'UTC' : options.timezone
  if (!options.isSchedule(job.schedule, zone)) return `Protobase's recurring jobs do not take this schedule${zone === 'UTC' ? '' : ` in ${zone}`}: give it a cron schedule`
  return undefined
}

export type CronPlanOptions = {
  /** Whether the project's database has pg_cron, so its jobs are scheduled there again as they were. */
  pgCron: boolean
  target: CronTarget
  /** pg_cron's `cron.timezone` in the source. */
  timezone: string
  /** Whether a Protobase recurring job takes a schedule in a time zone. */
  isSchedule: (schedule: string, timezone: string) => boolean
}

/**
 * What the import does with each of pg_cron's jobs: where the project's database has pg_cron, it schedules them there
 * again, as they were; elsewhere it makes each a Protobase recurring job running its SQL, unless the job is inactive,
 * calls what the database lacks, such as pg_net, or has a schedule Protobase's do not take, such as `30 seconds`. A job
 * of another database is left either way, since the import carries over this one alone.
 */
export const cronPlan = (jobs: CronJob[], options: CronPlanOptions): PlannedCronJob[] => {
  const names = new Set<string>()
  const files = new Set<string>()
  const exports = new Set<string>()
  return jobs.map((job) => {
    if (!job.local) return { ...job, outcome: { kind: 'left', reason: `runs in the database ${job.database}, which the import does not carry over` } }
    if (options.pgCron) return { ...job, outcome: { kind: 'rescheduled' } }
    const reason = leftReason(job, options)
    if (reason) return { ...job, outcome: { kind: 'left', reason } }
    const name = unique(names, jobName(job), job.id)
    const file = unique(files, fileName(name), job.id)
    return {
      ...job,
      outcome: { kind: 'converted', name, file, exportName: unique(exports, exportName(file), job.id, ''), timezone: utc.has(options.timezone) ? undefined : options.timezone },
    }
  })
}

export type CronJobToWrite = ConvertedCronJob & { schedule: string; command: string }

/** The pg_cron jobs the plan made Protobase recurring jobs, with what their files declare. */
export const convertedCronJobs = (jobs: PlannedCronJob[] | undefined): CronJobToWrite[] =>
  (jobs ?? []).flatMap((job) => {
    if (job.outcome.kind !== 'converted') return []
    const { kind: _, ...converted } = job.outcome
    return [{ ...converted, schedule: job.schedule, command: job.command }]
  })
