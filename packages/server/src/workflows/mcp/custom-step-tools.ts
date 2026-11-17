/**
 * The tools of custom steps and their runners: `save_custom_step` saves a step and waits for its build,
 * `get_custom_step` reads its versions and builds, `test_custom_step` runs one version on an input, `list_runners` reads
 * the runners and `create_runner_token` makes one with its install command. Each reads and writes the records as the
 * caller, through their access rules and the save check, and each write asks the user's approval in their client first.
 */
import { customStepOf } from '@protobase/workflows'
import { approvalTexts, recordBefore } from '../../assistant/record-before'
import { refused } from '../../assistant/record-tool-args'
import type { ToolRecords } from '../../assistant/records'
import { defineTool, type ToolContext } from '../../assistant/tools'
import { createApproval, updateApproval } from '../../assistant/write-prompts'
import { notApproved, onlyNote, outside, type WriteRecordToolsInput } from '../../assistant/write-tool-limits'
import { problemOf } from '../../error-handler'
import { notFound } from '../../problem'
import type { Row, Session } from '../../types'
import { objectOf, textOf } from './workflow-tool-args'

/** A runner's one-time registration token, valid an hour, with the one command that installs a runner with it. */
export type RunnerRegistration = { token: string; expires_at: string; command: string; endpoint: string }

/** What the custom steps' tools do beyond their records, as the caller. */
export type CustomStepService = {
  /** Starts a test run of the custom step version `step` names on `input`, its arguments, and gives the run's id. */
  test: (session: Session, step: string, input: Record<string, unknown>) => Promise<string>
  /** The ids of the tenant's runners online, and whether one of them builds images. */
  online: (tenant: unknown) => Promise<{ ids: string[]; builds: boolean }>
  /** Issues a runner's registration token, for the app at its own address, else `origin`. */
  register: (session: Session, id: string, origin: string) => Promise<RunnerRegistration>
  /** Whether the session may issue runners' registration tokens, which needs update access to the runners. */
  mayIssue: (session: Session) => Promise<boolean>
}

/** The custom steps' calls a tool makes, with the address a registration's command falls back on bound. */
export type CustomStepCalls = Omit<CustomStepService, 'register'> & { register: (session: Session, id: string) => Promise<RunnerRegistration> }

const reads = { readOnlyHint: true, openWorldHint: false }
const writes = { readOnlyHint: false, destructiveHint: false, openWorldHint: false }

/** The most a tool waits for a build or a test, in seconds. */
export const longestWaitSeconds = 120

// How often a wait reads the build or the job again, and how many lines of a log an answer gives.
const pollMs = 500
const tailLines = 30

const stepName = /^[a-z][a-z0-9_]*$/

const nameParameter = { type: 'string', description: 'The custom step\'s name, as list_workflow_types gives it in custom:<name>:<version>.' }
const waitParameter = (what: string) => ({ type: 'integer', minimum: 0, maximum: longestWaitSeconds, description: `How long to wait for ${what}, in seconds, at most ${longestWaitSeconds}; 0 by default, which answers at once.` })

const manifestParameters = {
  label: { type: 'string', description: 'What the step picker and the type list show, 1 to 100 characters.' },
  description: { type: 'string', description: 'What it does, for people; at most 2000 characters.' },
  container: {
    type: 'object',
    description: 'How its image is built and run: { "dockerfile": "FROM ...", "files": { "<relative path>": "<text>" }, "command": ["<program>", "<argument>"] }. dockerfile is at most 64 KiB and starts with FROM, after ARG lines and comments only; files are the files beside it that it COPYs, at most 1 MiB together; command is the argument list its container runs, the image\'s own without it.',
  },
  input: { type: 'object', description: 'The JSON Schema of its arguments, "type": "object"; a property { "x-file": true } takes a stored file. It may not declare store, which every custom step takes.' },
  output: { type: 'object', description: 'The JSON Schema of its result, "type": "object"; a property { "x-file": true } is a file its container writes, which the step stores.' },
  error_prefix: { type: 'string', description: 'The start of its error names, a capital then letters and digits, such as Ffmpeg; Custom by default.' },
  errors: { type: 'object', description: 'The errors its container may fail with, by name, each with what it means, such as { "UnsupportedInput": "the file is not a video" }.' },
}
const manifestFields = Object.keys(manifestParameters)

const waitOf = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.min(value, longestWaitSeconds) : 0)
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Reads `read` until `done` holds of what it gives or `seconds` pass, and gives what it read last.
const waited = async <T>(seconds: number, read: () => Promise<T>, done: (value: T) => boolean) => {
  const until = Date.now() + seconds * 1000
  let value = await read()
  while (!done(value) && Date.now() < until) {
    await sleep(Math.min(pollMs, until - Date.now()))
    value = await read()
  }
  return value
}

const secondsBetween = (from: unknown, to: unknown) => (typeof from === 'string' && typeof to === 'string' ? Math.round((Date.parse(to) - Date.parse(from)) / 1000) : undefined)
const tail = (lines: string[]) => lines.slice(-tailLines).join('\n')

/** A custom step's record by its name, as the caller may read it; undefined when they may read none of that name. */
const stepNamed = async (records: ToolRecords, name: string) => (await records.list('workflow_custom_steps', { filter: `name = "${name}"`, page_size: 1 })).items[0]

// A step's latest 20 versions, or only `version`, newest first.
const versionsOf = async (records: ToolRecords, step: unknown, version?: number) =>
  (await records.list('workflow_custom_step_versions', { filter: `custom_step_id = "${String(step)}"${version === undefined ? '' : ` AND version = ${String(version)}`}`, order_by: 'version desc', page_size: 20 })).items

/** One build as an answer gives it: its runner, status, the image's digest once ready, how long it took and its log's end. */
const buildOf = (build: Row) => ({
  runner: build.runner_id,
  status: build.status,
  ...(typeof build.digest === 'string' && { digest: build.digest }),
  ...(secondsBetween(build.started_at, build.finished_at) !== undefined && { seconds: secondsBetween(build.started_at, build.finished_at) }),
  ...(typeof build.log === 'string' && build.log !== '' && { log_tail: tail(build.log.split('\n')) }),
})

// The latest 20 builds of each of these versions, newest first, in one read, by version id.
const buildsOf = async (records: ToolRecords, versions: unknown[]) => {
  const byVersion = new Map<unknown, Row[]>(versions.map((version) => [version, []]))
  if (versions.length === 0) return byVersion
  const filter = versions.map((version) => `version_id = "${String(version)}"`).join(' OR ')
  const { items } = await records.list('workflow_custom_step_builds', { filter, order_by: 'started_at desc', limit_per: 'version_id:20', page_size: 20 * versions.length })
  for (const build of items) byVersion.get(build.version_id)?.push(build)
  return byVersion
}

// How a version's image stands: its first build that ended, ready before failed, else one under way, else whether a
// runner that builds is online to take it.
const buildStatus = (builds: Row[], building: boolean) => {
  const found = builds.find((build) => build.status === 'ready') ?? builds.find((build) => build.status === 'failed') ?? builds[0]
  if (found) return buildOf(found)
  return { status: building ? 'building' : 'no_runner' }
}

const ended = (build: { status: unknown }) => build.status === 'ready' || build.status === 'failed' || build.status === 'no_runner'

/** A save the custom step check refused, as `{ error, message, problems }`, each problem naming its field; any other refusal as `refused` words it. */
const stepRefused = (error: unknown) => {
  const problem = problemOf(error)
  if (problem?.slug === 'invalid-custom-step') return JSON.stringify({ error: 'invalid-custom-step', message: `${problem.detail}; nothing was saved. Fix each problem and save again.`, problems: problem.extras.problems })
  return refused(error)
}

/** Saves a custom step, a new one or the next version of one, and waits for its image's first build if asked. */
const saveCustomStepTool = (calls: CustomStepCalls, input: WriteRecordToolsInput) =>
  defineTool({
    name: 'save_custom_step',
    description: `Saves a custom step: a step type built from a Dockerfile that runs on the app's runners. Without id it creates one from its name and manifest; with id, the id this tool or get_custom_step gave, it changes the fields given, which saves the next version when the manifest changed (the name stays as created). Each version is its own step type, custom:<name>:<version>, so a workflow that names an earlier one keeps it. The manifest is checked on save: a refusal comes back as { error, problems }, each problem naming its field, such as container.dockerfile, and nothing is saved. Once saved, the app's runners that build images build the new version. Returns JSON { id, name, version, build }, build { status, runner?, digest?, seconds?, log_tail? }: status building while a runner builds it, ready with the image's digest, failed with the end of the build's log, or no_runner when no runner that builds images is online, so nothing builds it until one is (list_runners, create_runner_token). With wait_seconds it waits up to that long for the first build to end; read it later with get_custom_step. Pass the etag get_custom_step gave to fail when someone changed the step since. The user approves each save in their client first.${onlyNote(input)}`,
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: "The custom step's id, to save its next version; leave it out to create one." },
        name: { type: 'string', description: 'With no id: the name a Task gives it, custom:<name>:<version>, a lowercase letter, then lowercase letters, digits and "_", at most 64. It cannot change once created.' },
        ...manifestParameters,
        etag: { type: 'string', description: 'The etag get_custom_step gave, to fail when the custom step changed since.' },
        wait_seconds: waitParameter('the first build of the version to end'),
      },
    },
    annotations: writes,
    run: async (args, context) => {
      const id = textOf(args.id) || undefined
      const name = textOf(args.name)
      if (!id && (!name || !objectOf(args.container) || !objectOf(args.input) || !objectOf(args.output) || !textOf(args.label))) {
        return 'Pass { "name": "<name>", "label": "<label>", "container": { "dockerfile": "FROM ...", "files": {} }, "input": { "type": "object", ... }, "output": { "type": "object", ... } } to create one, or { "id": "<id>", ... } with the fields to change.'
      }
      const refusal = outside(input, 'workflow_custom_steps')
      if (refusal) return refusal
      const data: Row = Object.fromEntries(manifestFields.filter((field) => args[field] !== undefined).map((field) => [field, args[field]]))
      const { text, described } = await approvalTexts(context, 'workflow_custom_steps')
      let saving: () => Promise<{ record: Row }>
      if (id) {
        if (Object.keys(data).length === 0) return 'Pass the manifest fields to change; nothing was saved.'
        const before = await recordBefore(context, 'workflow_custom_steps', id, textOf(args.etag) || undefined)
        if (typeof before === 'string') return before
        const answer = await context.approve(updateApproval(text, described, id, before?.record ?? {}, data))
        if (answer !== 'approved') return notApproved(answer)
        const etag = textOf(args.etag)
        saving = () => context.records.update('workflow_custom_steps', id, data, { ...(etag && { etag }) })
      } else {
        const created = { name, ...data }
        const answer = await context.approve(createApproval(text, described, created))
        if (answer !== 'approved') return notApproved(answer)
        saving = () => context.records.create('workflow_custom_steps', created)
      }
      const saved = await saving().then(({ record }) => record, stepRefused)
      if (typeof saved === 'string') return saved
      const answer = { id: saved.id, name: saved.name, version: saved.version }
      const build = await builtVersion(context, calls, saved, waitOf(args.wait_seconds)).catch(refused)
      return JSON.stringify({ ...answer, build: typeof build === 'string' ? JSON.parse(build) : build })
    },
  })

// How the build of a saved step's current version stands, once its first build ended or `seconds` passed.
const builtVersion = async (context: ToolContext, calls: CustomStepCalls, step: Row, seconds: number) => {
  const [version] = await versionsOf(context.records, step.id, Number(step.version))
  if (!version) return { status: 'building' }
  const read = async () => buildStatus((await buildsOf(context.records, [version.id])).get(version.id)!, (await calls.online(context.session.tenant)).builds)
  return waited(seconds, read, ended)
}

/** A custom step's versions with their builds, by its name. */
const getCustomStepTool = defineTool({
  name: 'get_custom_step',
  description: "Reads a custom step by its name, as JSON { id, name, version, etag, step, versions }: its manifest as saved last (label, description, container, input, output, error_prefix, errors), the version that is, and its latest 20 versions, or only version when given, newest first, each with its step type (custom:<name>:<version>, a Task's Resource), who saved it and when, and its builds, one per runner that built it: the runner's id, status (building, ready or failed), the image's digest, how long it took and the end of its log. Pass the id and etag to save_custom_step to save the next version.",
  parameters: { type: 'object', properties: { name: nameParameter, version: { type: 'integer', minimum: 1, description: 'Only this version.' } }, required: ['name'] },
  annotations: reads,
  run: async (args, context) => {
    const name = textOf(args.name)
    if (!name || !stepName.test(name)) return 'Pass the custom step\'s name as { "name": "<name>" }, such as { "name": "ffmpeg_convert" }.'
    const read = async () => {
      const found = await stepNamed(context.records, name)
      if (!found) return refused(notFound(`No custom step named ${name} that you may read`))
      const { record, etag } = await context.records.get('workflow_custom_steps', String(found.id))
      if (args.version !== undefined && !Number.isInteger(args.version)) return `Pass version as a whole number, such as { "name": "${name}", "version": 2 }.`
      const version = args.version as number | undefined
      const versions = await versionsOf(context.records, record.id, version)
      if (version !== undefined && versions.length === 0) return refused(notFound(`${name} has no version ${String(version)} that you may read`))
      const builds = await buildsOf(context.records, versions.map((one) => one.id))
      const listed = versions.map((one) => ({ version: one.version, type: `custom:${name}:${String(one.version)}`, saved_by: one.saved_by, saved_at: one.saved_at, builds: builds.get(one.id)!.map(buildOf) }))
      const step = Object.fromEntries(['label', 'description', ...manifestFields].flatMap((field) => (field in record ? [[field, record[field]]] : [])))
      return JSON.stringify({ id: record.id, name: record.name, version: record.version, etag, step, versions: listed })
    }
    return read().catch(refused)
  },
})

// A test's answer from its job as the caller reads it, or its run's when the run ended before a job was queued.
const testAnswer = (run: string, job: Row | undefined, ran: Row) => {
  if (!job) {
    const failed = ran.status === 'failed'
    return { run_id: run, job_id: null, status: failed ? 'failed' : 'queued', ...(failed && { error: ran.error, cause: ran.cause }) }
  }
  const lines = Array.isArray(job.logs) ? job.logs.map((line: { message?: unknown }) => String(line.message ?? '')) : []
  const seconds = secondsBetween(job.queued_at, job.finished_at)
  return {
    run_id: run,
    job_id: job.id,
    status: job.status,
    ...(job.status === 'succeeded' ? { output: job.output } : job.error ? { error: job.error, cause: job.cause } : {}),
    log_tail: tail(lines),
    ...(seconds !== undefined && { seconds }),
  }
}

const settled = (answer: { status: unknown }) => answer.status !== 'queued' && answer.status !== 'running'

/** Runs one job of a custom step version on an input, without a workflow. */
const testCustomStepTool = (calls: CustomStepCalls, input: WriteRecordToolsInput) =>
  defineTool({
    name: 'test_custom_step',
    description: `Runs one job of a custom step version on an input, without a workflow: a test run of that version alone, on one of your runners, as a workflow's Task would run it, and returns JSON { run_id, job_id, status, output, error, cause, log_tail, seconds }: status queued, running, succeeded with its output, or failed or timed_out with its error and cause (Custom.Failed with the end of its stderr, Custom.InvalidOutput, or one of its own errors), the last lines its container wrote, and how long the job took from queued to done. A file input takes a stored file as the storage steps give it, { configuration, path, name, type, size }; a version whose output gives a file needs store, { configuration, path? }, where it keeps them. With wait_seconds it waits up to that long for the job to end; get_workflow_run reads its run later. The job waits for a runner as any does: list_runners says which are online. The user approves each test in their client first.${onlyNote(input)}`,
    parameters: {
      type: 'object',
      properties: {
        name: nameParameter,
        version: { type: 'integer', minimum: 1, description: 'The version to test.' },
        input: { type: 'object', description: "The step's arguments, as its input schema takes them; a file argument a stored file, { configuration, path, name, type, size }." },
        store: { type: 'object', description: 'Where the files it gives are stored: { "configuration": "<storage configuration>", "path": "<folder>" }, path optional.' },
        wait_seconds: waitParameter('the job to end'),
      },
      required: ['name', 'version', 'input'],
    },
    annotations: { ...writes, openWorldHint: true },
    run: async (args, context) => {
      const name = textOf(args.name)
      const given = objectOf(args.input)
      const store = args.store === undefined ? undefined : objectOf(args.store)
      if (!name || !stepName.test(name) || !Number.isInteger(args.version) || !given || (args.store !== undefined && !store)) {
        return 'Pass { "name": "<name>", "version": <version>, "input": { ... } }, and "store": { "configuration": "<name>" } when it gives a file.'
      }
      if (given.store !== undefined && store) return 'Pass store once: either in input or beside it.'
      const refusal = outside(input, 'workflow_runs')
      if (refusal) return refusal
      const step = `custom:${name}:${String(args.version)}`
      if (!customStepOf(step)) return 'Pass the version as a whole number from 1, such as 2.'
      const arguments_ = { ...given, ...(store && { store }) }
      const found = await stepNamed(context.records, name).then((one) => one ?? refused(notFound(`No custom step named ${name} that you may read`)), refused)
      if (typeof found === 'string') return found
      const { text } = await approvalTexts(context, 'workflow_runs')
      const answer = await context.approve({ title: text('testTitle', { step }), body: text('testBody'), code: JSON.stringify(arguments_, null, 2), approveLabel: text('test'), rejectLabel: text('reject') })
      if (answer !== 'approved') return notApproved(answer)
      const run = await calls.test(context.session, step, arguments_).catch(refused)
      if (!/^[0-9a-f-]{36}$/i.test(run)) return run
      const read = async () => {
        const [jobs, ran] = await Promise.all([context.records.list('workflow_custom_step_jobs', { filter: `run_id = "${run}"`, order_by: 'queued_at desc', page_size: 1 }), context.records.get('workflow_runs', run, { fields: ['status', 'error', 'cause'] })])
        return testAnswer(run, jobs.items[0], ran.record)
      }
      return waited(waitOf(args.wait_seconds), read, settled).then((done) => JSON.stringify(done), refused)
    },
  })

/** A runner as list_runners gives it, with whether it is online now and what it said of itself with its last claim. */
const runnerOf = (runner: Row, online: boolean) => {
  const state = objectOf(runner.state) ?? {}
  const capacity = objectOf(state.capacity)
  const images = Array.isArray(state.images) ? state.images.flatMap((image) => (typeof objectOf(image)?.step === 'string' ? [String(objectOf(image)!.step)] : [])) : []
  return {
    id: runner.id,
    name: runner.name,
    online,
    revoked: runner.revoked,
    registered: runner.registered_at !== null && runner.registered_at !== undefined,
    labels: runner.labels,
    platform: runner.platform ?? null,
    kinds: Array.isArray(state.kinds) ? state.kinds : runner.kinds,
    free_slots: typeof capacity?.slots === 'number' ? capacity.slots : null,
    images,
    polled_at: runner.polled_at ?? null,
  }
}

/** The caller's tenant's runners, with which are online. */
const listRunnersTool = (calls: CustomStepCalls) =>
  defineTool({
    name: 'list_runners',
    description: "Lists the runners that run your custom steps, as JSON { runners }, each with its id, name, whether it is online (holding a claim for work now, or running a job), whether it is revoked and registered, its labels, platform (such as linux/amd64), the kinds of work it does (container, and build when it builds images), its free slots and the custom step versions whose images it holds, as it said with its last claim, and when that was (polled_at). A custom step's job waits until one of them takes it; create_runner_token makes another.",
    parameters: { type: 'object', properties: {} },
    annotations: reads,
    run: async (_args, context) => {
      const listed = async () => {
        const [page, online] = await Promise.all([context.records.list('workflow_runners', { order_by: 'name asc', page_size: 100 }), calls.online(context.session.tenant)])
        return JSON.stringify({ runners: page.items.map((runner) => runnerOf(runner, online.ids.includes(String(runner.id)))) })
      }
      return listed().catch(refused)
    },
  })

const labelsParameter = { type: 'array', items: { type: 'string' }, description: 'Labels jobs may need of it, such as ["gpu"]: at most 20, each lowercase letters, digits and "_.:-". None by default.' }

/** Makes a runner and gives the one command that installs it, with its one-time token. */
const createRunnerTokenTool = (calls: CustomStepCalls, input: WriteRecordToolsInput) =>
  defineTool({
    name: 'create_runner_token',
    description: `Makes a runner, a machine that runs your custom steps, and returns JSON { id, name, labels, command, expires_at, endpoint }: command is the one command a person runs on a Linux machine with Docker or Podman, as the user the runner runs as, to install and register it, with a one-time token valid until expires_at, an hour, shown this once. The runner then claims your custom steps' jobs and builds their images; list_runners shows it online. Give the command to the person to run; never run it yourself. The user approves it in their client first.${onlyNote(input)}`,
    parameters: { type: 'object', properties: { name: { type: 'string', description: 'What to call the runner, 1 to 100 characters, such as "Video box".' }, labels: labelsParameter }, required: ['name'] },
    annotations: writes,
    run: async (args, context) => {
      const name = textOf(args.name)
      if (!name || (args.labels !== undefined && !Array.isArray(args.labels))) return 'Pass { "name": "<name>" }, and labels as a list such as ["gpu"].'
      const refusal = outside(input, 'workflow_runners')
      if (refusal) return refusal
      // Its token is issued as the registration route issues one, to who may change the runner: checked before anything
      // is made, so no runner is left without one
      if (!(await calls.mayIssue(context.session))) return JSON.stringify({ error: 'forbidden', message: 'Making a runner with its install command needs both workflow_runners.create and workflow_runners.update; nothing was made.' })
      const data = { name, ...(args.labels !== undefined && { labels: args.labels }) }
      const { text } = await approvalTexts(context, 'workflow_runners')
      const answer = await context.approve({ title: text('runnerTitle', { name }), body: text('runnerBody'), approveLabel: text('create'), rejectLabel: text('reject') })
      if (answer !== 'approved') return notApproved(answer)
      const made = await context.records.create('workflow_runners', data).then(({ record }) => record, refused)
      if (typeof made === 'string') return made
      const issued = await calls.register(context.session, String(made.id)).catch((error: unknown) => {
        const refusal = JSON.parse(refused(error)) as { error: string; message: string }
        return JSON.stringify({ ...refusal, message: `The runner ${String(made.id)} was made, but its token was not issued: ${refusal.message}` })
      })
      if (typeof issued === 'string') return issued
      return JSON.stringify({ id: made.id, name: made.name, labels: made.labels, command: issued.command, expires_at: issued.expires_at, endpoint: issued.endpoint })
    },
  })

/** The custom steps' tools that only read. */
export const customStepReadTools = (calls: CustomStepCalls) => [getCustomStepTool, listRunnersTool(calls)]

/** The custom steps' tools that write, on the resources `input` allows. */
export const customStepWriteTools = (calls: CustomStepCalls, input: WriteRecordToolsInput = {}) => [saveCustomStepTool(calls, input), testCustomStepTool(calls, input), createRunnerTokenTool(calls, input)]
