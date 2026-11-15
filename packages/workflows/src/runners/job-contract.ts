import type { JsonSchema } from '../plugin/context'

/** What a runner builds a custom step's image from: its version's Dockerfile, the files beside it and its command. */
export type JobBuild = { dockerfile: string; files: Record<string, string>; command?: string[] }

/**
 * An input file of a job, for the runner to download before its container starts: the argument it is, its file name,
 * type and size, and the job-scoped address it streams from, a path on the app, allowed only to the runner holding the
 * job while it runs.
 */
export type JobFile = { input: string; name: string; type: string; size: number; url: string }

/**
 * A job as a claim gives it: its step, its arguments as given, its time, its input files, the outputs that are files
 * the container gives (`output_files`), how its image is built and the command its container runs.
 */
export type RunnerJob = {
  id: string
  step: string
  input: unknown
  deadline: string
  heartbeat_seconds: number
  lease_seconds: number
  files: JobFile[]
  output_files: string[]
  build: JobBuild
  command?: string[]
}

/**
 * What a claim is answered with: a job to run; an order to prepare a step's image, which the runner builds when it has
 * not got it before it claims again; or nothing once the claim was held as long as it may be.
 */
export type RunnerOrder = { order: 'job'; job: RunnerJob } | { order: 'prepare'; step: string; build: JobBuild } | { order: 'none' }

export const buildStatuses = ['building', 'ready', 'failed'] as const

/** A build a runner reports, as it starts and as it ends: its step version, its status, its image's digest and its log's tail. */
export type BuildReport = { step: string; status: (typeof buildStatuses)[number]; digest?: string; log?: string }

/** The kind a runner says it has when it builds images, beside `container`; only such runners are sent `prepare`. */
export const buildKind = 'build'

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * The arguments a schema takes as files, by name: its top-level properties with `x-file: true`, which a runner gets as
 * files in its input folder and gives as files it uploads. A manifest marks a file nowhere else (`manifestProblems`).
 */
export const fileProperties = (schema: JsonSchema): string[] =>
  isObject(schema.properties) ? Object.entries(schema.properties).flatMap(([name, property]) => (isObject(property) && property['x-file'] === true ? [name] : [])) : []
