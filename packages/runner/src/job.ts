import { chmod, lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { jobErrors, type JobCompletion, type RunnerJob } from '@protobase/workflows'
import type { AppClient } from './app'
import type { Builder } from './builds'
import type { Settings } from './config'
import { containerPaths, imageTag, runArgs, type Engine, type Identity } from './engine'

/** How much of a failed container's stderr its failure keeps as the cause: the end, where it says why. */
export const causeChars = 2000

// The most of output.json and error.json the runner reads; the app keeps at most 256 KiB of an output.
const jsonBytes = 1024 * 1024

// Lines go to the app at least this often while a job runs, and at most this many at once.
const logMs = 1000
const logBatch = 100

const types: Record<string, string> = {
  mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', pdf: 'application/pdf', json: 'application/json',
  txt: 'text/plain', csv: 'text/csv', html: 'text/html', xml: 'application/xml', zip: 'application/zip', gz: 'application/gzip',
}

/** The type of a file the container gave, by its extension. */
export const typeOf = (file: string) => types[path.extname(file).slice(1).toLowerCase()] ?? 'application/octet-stream'

/** An input's file name as the container sees it: its last segment, without control characters, or `file`. */
export const fileName = (name: string) => {
  const last = name.slice(Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\')) + 1).replace(/[\u0000-\u001f\u007f]/g, '').trim()
  return last === '' || last === '.' || last === '..' ? 'file' : last.slice(0, 255)
}

/** The variable a scalar input is also in: `INPUT_` and its name in capitals, other characters as `_`. */
export const inputVariable = (name: string) => `INPUT_${name.toUpperCase().replace(/[^A-Z0-9_]/g, '_')}`

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * What the container gets of the job's arguments: `input.json`, the arguments without Protobase's own `store`, each
 * file replaced by where it is in the container, `{ path, name, type, size }`; and each scalar argument also as an
 * `INPUT_<NAME>` variable. Inputs whose names cannot be a folder's are refused.
 */
export const containerInput = (job: Pick<RunnerJob, 'input' | 'files'>) => {
  const args = isObject(job.input) ? { ...job.input } : {}
  delete args.store
  const files = job.files.map((file) => {
    if (!/^[A-Za-z0-9_][A-Za-z0-9._-]*$/.test(file.input)) throw new Error(`The input ${JSON.stringify(file.input)} cannot be a folder's name`)
    const name = fileName(file.name)
    return { ...file, name, at: `${file.input}/${name}` }
  })
  for (const file of files) args[file.input] = { path: `${containerPaths.in}/${file.at}`, name: file.name, type: file.type, size: file.size }
  const env = Object.fromEntries(
    Object.entries(args).flatMap(([name, value]) => (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? [[inputVariable(name), String(value)]] : [])),
  )
  return { json: args, files, env }
}

/**
 * A regular file under the output folder that `given` names, by a relative path; undefined for one that is not there,
 * leaves the folder, is no plain file, or is reached through a link, so a container cannot point the runner at a file of
 * the machine.
 */
export const outputFile = async (out: string, given: unknown) => {
  if (typeof given !== 'string' || given === '' || path.isAbsolute(given) || given.split('/').includes('..')) return
  const file = path.join(out, given)
  const stat = await lstat(file).catch(() => undefined)
  if (!stat?.isFile()) return
  const real = await realpath(file).catch(() => undefined)
  const root = await realpath(out)
  return real && real.startsWith(`${root}${path.sep}`) && real === path.join(root, given) ? file : undefined
}

// A JSON file the container wrote, read as the plain file it must be, at most `jsonBytes`.
const readJson = async (out: string, name: string): Promise<{ value: unknown } | { problem: string } | undefined> => {
  const file = path.join(out, name)
  const stat = await lstat(file).catch(() => undefined)
  if (!stat) return
  if (!stat.isFile()) return { problem: `${name} is not a plain file` }
  if (stat.size > jsonBytes) return { problem: `${name} is ${stat.size} bytes, more than the ${jsonBytes} the runner reads` }
  try {
    return { value: JSON.parse(await readFile(file, 'utf8')) as unknown }
  } catch {
    return { problem: `${name} is not JSON` }
  }
}

/** A job's lines, sent to the app in batches as they come, never the runner's own. */
const logLines = (app: AppClient, job: string, say: (line: string) => void) => {
  let lines: string[] = []
  let sending = Promise.resolve()
  const send = () => {
    if (lines.length === 0) return sending
    const batch = lines.splice(0, logBatch)
    sending = sending.then(() => app.log(job, batch).then(() => {}, (error: unknown) => say(`job ${job}: could not send its log: ${String(error)}`)))
    return sending
  }
  const timer = setInterval(() => void send(), logMs)
  return {
    add: (line: string) => {
      lines.push(line)
      if (lines.length >= logBatch) void send()
    },
    close: async () => {
      clearInterval(timer)
      while (lines.length > 0) await send()
      await sending
      lines = []
    },
  }
}

export type JobInput = { app: AppClient; engine: Engine; build: Builder; settings: Settings; identity: Identity; say: (line: string) => void }

/**
 * Runs one job: downloads its input files into a fresh folder, writes `input.json`, builds its step's image when the
 * runner has not got it, runs the container hardened (`runArgs`), and completes the job: with `output.json`, each file it
 * names uploaded and replaced by the stored file the app answers; with `error.json`'s `{ error, cause }`; or, on any
 * other exit, `Custom.Failed` with the end of stderr. It heartbeats all along, and kills the container at the job's
 * deadline or when a heartbeat answers stop, completing nothing then; the job's folder is deleted after.
 * `signal` stops it as the runner stops.
 */
export const runJob = async ({ app, engine, build, settings, identity, say }: JobInput, job: RunnerJob, signal?: AbortSignal) => {
  const stopped = new AbortController()
  const stop = (why: string) => {
    if (stopped.signal.aborted) return
    say(`job ${job.id}: ${why}`)
    stopped.abort(why)
  }
  const stopping = () => stop('stopped, as the runner stops')
  signal?.addEventListener('abort', stopping, { once: true })
  const heartbeats = setInterval(() => {
    app.heartbeat(job.id).then(
      (answer) => answer.stop && stop('stopped, as the app answered its heartbeat'),
      (error: unknown) => say(`job ${job.id}: heartbeat failed: ${String(error)}`),
    )
  }, job.heartbeat_seconds * 1000)
  const deadline = setTimeout(() => stop('killed at its deadline'), Math.max(0, Date.parse(job.deadline) - Date.now()))
  const logs = logLines(app, job.id, say)
  await mkdir(settings.work_dir, { recursive: true, mode: 0o700 })
  const work = await mkdtemp(path.join(settings.work_dir, 'job-'))
  const container = `protobase-job-${job.id}`
  const tag = imageTag(identity, job.step)
  say(`job ${job.id}: ${job.step} started`)
  try {
    const completion = await perform()
    // Its lines reach the app before its completion, after which the job no longer takes any.
    await logs.close()
    if (completion && !stopped.signal.aborted) {
      await app.complete(job.id, completion)
      say(`job ${job.id}: ${'output' in completion ? 'succeeded' : `failed with ${completion.error}`}`)
    }
  } catch (error) {
    say(`job ${job.id}: failed: ${error instanceof Error ? error.message : String(error)}`)
    await logs.close()
    if (!stopped.signal.aborted) await app.complete(job.id, { error: jobErrors.failed, cause: `The runner could not run the job: ${error instanceof Error ? error.message : String(error)}` }).catch(() => {})
  } finally {
    signal?.removeEventListener('abort', stopping)
    clearInterval(heartbeats)
    clearTimeout(deadline)
    await logs.close()
    await removeWork()
  }

  async function perform(): Promise<JobCompletion | undefined> {
    const input = containerInput(job)
    const into = path.join(work, 'in')
    const out = path.join(work, 'out')
    await mkdir(into, { mode: 0o755 })
    await mkdir(out)
    // The container's user is not the runner's: it reads the inputs and writes its outputs as anyone may.
    await chmod(into, 0o755)
    await chmod(out, 0o777)
    for (const file of input.files) {
      await mkdir(path.join(into, file.input), { mode: 0o755 })
      await app.download(file.url, path.join(into, file.at), stopped.signal)
    }
    await writeFile(path.join(into, 'input.json'), JSON.stringify(input.json), { mode: 0o644 })
    const built = await build(job.step, job.build)
    if (!built.built) return { error: jobErrors.failed, cause: `The step's image did not build: ${built.log}`.slice(-causeChars) }
    if (stopped.signal.aborted) return
    let stderr = ''
    const killed = () => void engine.kill(container)
    stopped.signal.addEventListener('abort', killed, { once: true })
    const ran = await engine.run(runArgs({ name: container, image: tag, ...(job.command && { command: job.command }), work, settings, env: Object.keys(input.env) }), {
      env: input.env,
      line: (line, stream) => {
        logs.add(line)
        if (stream === 'stderr') stderr = `${stderr}${line}\n`.slice(-causeChars)
      },
    })
    stopped.signal.removeEventListener('abort', killed)
    if (stopped.signal.aborted) return
    const failed = await readJson(out, 'error.json')
    if (failed && 'value' in failed && isObject(failed.value) && typeof failed.value.error === 'string') {
      return { error: failed.value.error, ...(typeof failed.value.cause === 'string' && { cause: failed.value.cause }) }
    }
    if (ran.code !== 0) return { error: jobErrors.failed, cause: stderr.trim() === '' ? `The container exited with ${ran.code}` : stderr.slice(-causeChars) }
    const given = await readJson(out, 'output.json')
    if (!given) return { error: jobErrors.invalidOutput, cause: 'The container wrote no output.json' }
    if ('problem' in given) return { error: jobErrors.invalidOutput, cause: given.problem }
    if (!isObject(given.value)) return { output: given.value }
    const output = { ...given.value }
    for (const name of job.output_files) {
      if (output[name] === undefined) continue
      const file = await outputFile(out, output[name])
      if (!file) return { error: jobErrors.invalidOutput, cause: `${name} names no file the container wrote: give a path relative to $PROTOBASE_OUT, such as "result.mp4"` }
      output[name] = await app.upload(job.id, path.relative(out, file).split(path.sep).join('/'), file, typeOf(file), stopped.signal)
    }
    return { output }
  }

  // Files the container's user left in folders of its own cannot be removed by the runner's user: the container's
  // root, of the step's own image, removes them then.
  async function removeWork() {
    const removed = await rm(work, { recursive: true, force: true }).then(() => true, () => false)
    if (removed) return
    await engine.clean(tag, work)
    await rm(work, { recursive: true, force: true }).catch((error: unknown) => say(`job ${job.id}: could not remove ${work}: ${String(error)}`))
  }
}
