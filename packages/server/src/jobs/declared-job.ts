import type { Db } from '@protobase/query'
import { argumentsSchema, type ArgumentsSpec, type ArgumentType } from '@protobase/schema'
import { currentJobs } from './current'
import { defineJob } from './define-job'
import type { EnqueueOptions, JobContext, JobDefinition, JobOptions } from './job-types'

/**
 * A job as `protobase.config.ts` declares it, by its name: what it does, its arguments and when it runs. Its run is the
 * default export of `jobs/<name>.ts`, loaded the first time the job runs.
 */
export type JobDeclaration = Omit<JobOptions<unknown>, 'name' | 'payload' | 'run'> & {
  /** What the job does, for the people who read the config and the failed jobs page. */
  description?: string
  /** Its arguments by name, each a field type or a type with options (see `ArgumentSpec`), such as `{ invoiceId: 'bigint' }`. */
  arguments?: ArgumentsSpec
}

/** The default export of `jobs/<name>.ts`: what the job does with its arguments. */
export type JobRun<Payload = Record<string, unknown>> = (payload: Payload, context: JobContext) => Promise<void> | void

/** The job a config declares, whose run `load` gives on its first run. */
export const declaredJob = (name: string, { description: _, arguments: args, ...options }: JobDeclaration, load: () => Promise<JobRun>): JobDefinition => {
  let run: Promise<JobRun> | undefined
  return defineJob<Record<string, unknown>>({
    ...options,
    name,
    ...(args && { payload: argumentsSchema(name, args) as never }),
    run: async (payload, context) => (await (run ??= load()))(payload ?? {}, context),
  })
}

/**
 * Enqueues the job named `name`, which the config declares, in `db`'s own transaction when it is one, and returns its
 * id: what a write hook calls, so the job commits with the write or not at all. `EnqueueJob<typeof config>` types it
 * with the config's job names and arguments.
 */
export const enqueueJob = (db: Db, name: string, payload?: Record<string, unknown>, options?: EnqueueOptions): Promise<string> => {
  const runtime = currentJobs()
  const definition = runtime.definition(name)
  if (!definition) throw new Error(`There is no job "${name}": declare it in protobase.config.ts's jobs`)
  return runtime.enqueue(definition, db, payload, options)
}

// The value an argument of the type holds, as a field of that type does: a number for `integer`, a string for `bigint`
// and `decimal`, which JSON numbers cannot hold exactly.
type TypeValue<Type> = Type extends 'integer' ? number : Type extends 'boolean' ? boolean : Type extends 'json' ? unknown : string

// The value of one argument: an enum's own values when the spec names them; unknown for a spec read from JSON, whose
// type is a plain string.
type ArgumentValue<Spec> = Spec extends ArgumentType
  ? TypeValue<Spec>
  : Spec extends { type: 'enum'; values: readonly (infer Value)[] }
    ? Value
    : Spec extends { type: infer Type extends ArgumentType }
      ? TypeValue<Type>
      : unknown

type Optional<Spec> = Spec extends { optional: true } ? true : false

// One object type for the required and the optional arguments, as an editor shows it.
type Flat<Type> = { [Key in keyof Type]: Type[Key] }

/**
 * The payload of a job with these arguments, as it is enqueued with it and its run gets it: `{ invoiceId: string }` for
 * `{ invoiceId: 'bigint' }`, an argument with `optional: true` left out at will.
 */
export type ArgumentsPayload<Spec extends ArgumentsSpec> = Flat<
  { -readonly [Name in keyof Spec as Optional<Spec[Name]> extends true ? never : Name]: ArgumentValue<Spec[Name]> } & {
    -readonly [Name in keyof Spec as Optional<Spec[Name]> extends true ? Name : never]?: ArgumentValue<Spec[Name]>
  }
>

// The jobs `protobase.config.ts` declares, from the type of its default export: the config, or a function that returns
// it, at once or as a promise.
type DeclaredJobs<Config> = (Config extends (...args: never[]) => infer Returned ? Awaited<Returned> : Config) extends { jobs?: infer Jobs } ? NonNullable<Jobs> : never

/** The names of the jobs a config declares, from `typeof config` of its `protobase.config.ts`. */
export type JobName<Config> = keyof DeclaredJobs<Config> & string

/**
 * The payload of the job `Name` a config declares, from its `arguments` (see `ArgumentsPayload`): what the job is
 * enqueued with and what its `JobRun` gets. A job without `arguments` takes any payload, unchecked.
 */
export type JobPayload<Config, Name extends JobName<Config>> = DeclaredJobs<Config>[Name] extends { arguments: infer Spec extends ArgumentsSpec } ? ArgumentsPayload<Spec> : Record<string, unknown>

/**
 * `enqueueJob`, typed with the jobs of a config, so a name it does not declare or a payload that does not fit its
 * arguments fails to compile: `const enqueue: EnqueueJob<typeof config> = enqueueJob`. The payload may be left out when
 * no argument is required.
 */
export type EnqueueJob<Config> = <Name extends JobName<Config>>(
  db: Db,
  name: Name,
  ...rest: {} extends JobPayload<Config, Name> ? [payload?: JobPayload<Config, Name>, options?: EnqueueOptions] : [payload: JobPayload<Config, Name>, options?: EnqueueOptions]
) => Promise<string>
