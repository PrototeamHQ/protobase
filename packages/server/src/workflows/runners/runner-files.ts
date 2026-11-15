import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { stepPath } from '@protobase/workflow-plugins'
import { fileProperties, StepError, type JobFile } from '@protobase/workflows'
import { isFileValue, isStoredFile } from '@protobase/workflows/plugin'
import type { FilesRuntime } from '../../files/runtime'
import { HttpProblem, notFound } from '../../problem'
import { privateRunStore, runFileRef } from '../run-files'
import { pluginStorage, type StorageInput } from '../storage/plugin-storage'
import { isStoredPath } from '../storage/stored-path'
import type { JobSealer } from './job-seal'
import type { Runner } from './runner-jobs'

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * A job's input files, as its claim lists them: each argument its version's input takes as a file (`x-file`) that was
 * given, a stored file or a file of the run, with its name, type, size and its job-scoped address under `base`; or the
 * failure of the Task when one is neither.
 */
export const jobFiles = (schema: Record<string, unknown>, args: unknown, base: string): { files: JobFile[] } | { error: string; cause: string } => {
  const given = isObject(args) ? args : {}
  const files: JobFile[] = []
  for (const input of fileProperties(schema)) {
    const value = given[input]
    if (value === undefined || value === null) continue
    if (!isStoredFile(value) && !isFileValue(value)) return { error: 'Storage.InvalidArguments', cause: `${input} is neither a stored file ({ configuration, path, name, type, size }) nor a file of the run` }
    files.push({ input, name: value.name, type: value.type, size: value.size, url: `${base}/${encodeURIComponent(input)}` })
  }
  return { files }
}

// A store's failure as the route's problem, under the step error's name: a file or configuration that is not there is
// 404, an argument that names none is 400, any other 409.
const problemOf = (error: unknown): never => {
  if (!(error instanceof StepError)) throw error
  const status = error.error === 'Storage.NotFound' ? 404 : error.error === 'Storage.InvalidArguments' || error.error === 'States.TaskFailed' ? 400 : 409
  throw new HttpProblem(status, error.error.toLowerCase().replace('.', '-'), error.error, error.reason)
}

// The file of the run a value names, or the route's problem when it names none of the run's own.
const runFileOf = (runId: string, value: unknown, name: string) => {
  try {
    return runFileRef(runId, value, name)
  } catch (error) {
    return problemOf(error)
  }
}

const notHeld = () => new HttpProblem(409, 'job-not-held', 'Conflict', 'This runner does not hold this job: it ended, or went back to the queue and to another runner')

type HeldJob = { run_id: string; visit: string; status: string; runner_id: string | null; sent_at: Date | null; arguments: string | null; input_schema: Record<string, unknown> }

/**
 * A job's files, which only the runner holding the job reaches, and only while it runs: once the job ended, went back
 * to the queue or to another runner, each call is refused. The files are read and stored as the job's run's last
 * editor, as the run's own storage steps are (`pluginStorage`), so a runner reaches no configuration the workflow could
 * not, and holds no storage key itself.
 */
export const runnerFiles = ({ db, schema, sealer, storage, files }: { db: () => Db; schema: string; sealer: JobSealer; storage: StorageInput; files: () => FilesRuntime | undefined }) => {
  const held = async (runner: Runner, id: string) => {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound('No job with this id')
    const { rows } = await sql<HeldJob>`select j.run_id, j.visit, j.status, j.runner_id, j.sent_at, j.arguments, v.input as input_schema
      from ${sql.id(schema, 'custom_step_jobs')} j join ${sql.id(schema, 'custom_step_versions')} v on v.id = j.version_id where j.id = ${id}`.execute(db())
    const job = rows[0]
    if (!job) throw notFound('No job with this id')
    if (job.runner_id !== runner.id || job.status !== 'running' || job.sent_at === null || job.arguments === null) throw notHeld()
    const opened = await sealer.open(job.arguments)
    if (!opened) throw notHeld()
    return { job, args: isObject(opened.value) ? opened.value : {} }
  }

  return {
    /**
     * The bytes of the job's input file `name`, an argument its version takes as a file: a stored file streamed from
     * its configuration, or a file of the run from the app's private files.
     */
    input: async (runner: Runner, id: string, name: string): Promise<Response> => {
      const { job, args } = await held(runner, id)
      const value = args[name]
      if (!fileProperties(job.input_schema).includes(name) || value === undefined || value === null) throw notFound(`This job has no input file ${JSON.stringify(name)}`)
      const headers = (type: string) => ({ 'content-type': type || 'application/octet-stream', 'cache-control': 'no-store' })
      if (isStoredFile(value)) {
        const { file, body } = await pluginStorage(storage, job.run_id).read(value, name).catch(problemOf)
        return new Response(body, { headers: headers(file.type) })
      }
      const ref = runFileOf(job.run_id, value, name)
      const store = privateRunStore(files())
      const body = store && (await store.read(ref.path))
      if (!body) throw notFound(`${name} names a file that is gone`)
      return new Response(body, { headers: headers(ref.type ?? 'application/octet-stream') })
    },

    /**
     * Streams a file the job's container wrote, at `path` under its output folder, into the storage configuration its
     * `store` argument names, under the folder its `path` names or else the step's own, and answers the stored file.
     */
    output: async (runner: Runner, id: string, path: string, body: ReadableStream<Uint8Array>, type: string) => {
      if (!isStoredPath(path)) throw new HttpProblem(400, 'invalid-output-path', 'Bad Request', 'The path is relative: letters, digits, ".", "_" and "-" in segments split by "/", none starting with "."')
      const { job, args } = await held(runner, id)
      const store = args.store
      if (!isObject(store) || typeof store.configuration !== 'string' || (store.path !== undefined && typeof store.path !== 'string')) {
        throw new HttpProblem(409, 'no-store', 'Conflict', "This job's store argument names no storage configuration, { configuration, path? }, so it stores no files")
      }
      const folder = (store.path as string | undefined) ?? (await stepPath({ runId: job.run_id, idempotencyKey: `${job.run_id}/${job.visit}` }))
      const name = path.slice(path.lastIndexOf('/') + 1)
      return pluginStorage(storage, job.run_id).put(store.configuration, `${folder.replace(/\/+$/, '')}/${path}`, body, { name, type: type || 'application/octet-stream' }).catch(problemOf)
    },
  }
}
