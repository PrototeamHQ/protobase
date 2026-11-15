import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { JobCompletion, RunnerJob } from '@protobase/workflows'
import type { AppClient, StoredFile } from '../app'
import type { Settings } from '../config'
import type { Exec, ExecOptions, ExecResult } from '../exec'

/** A command the fake engine was given, with the variables it was given beside it. */
export type Ran = { command: string; args: string[]; env?: Record<string, string> }

/**
 * An engine for the tests: it records every command line and answers each as `answer` says, by default as Docker would
 * for an image that is there, its output's lines given as they would come. A container's run is `answer` too, which
 * can read the job's folders from its `-v` mounts.
 */
export const fakeExec = (answer: (ran: Ran, options: ExecOptions) => Promise<Partial<ExecResult>> | Partial<ExecResult> = () => ({})) => {
  const ran: Ran[] = []
  const exec: Exec = async (command, args, options = {}) => {
    const one = { command, args: [...args], ...(options.env && { env: options.env }) }
    ran.push(one)
    const result = { code: 0, stdout: '', stderr: '', ...(await answer(one, options)) }
    for (const stream of ['stdout', 'stderr'] as const) for (const line of result[stream].split('\n').filter(Boolean)) options.line?.(line, stream)
    return result
  }
  return { exec, ran }
}

/** The host folders a container's command line mounts, its job folder's `in` and `out`. */
export const mounts = (args: readonly string[]) => {
  const volumes = args.flatMap((arg, at) => (args[at - 1] === '-v' ? [arg] : []))
  const into = volumes.find((volume) => volume.endsWith(':/protobase/in:ro'))!.split(':')[0]!
  const out = volumes.find((volume) => volume.endsWith(':/protobase/out'))!.split(':')[0]!
  return { into, out, work: path.dirname(into) }
}

/** What the fake app was sent, in order. */
export type AppCall = { call: string; job?: string; body?: unknown }

/**
 * An app for the tests, as a runner reaches it: it records each call, writes each input file it is asked for with
 * `bytes`, and answers each upload with a stored file of the videos configuration; `heartbeat` says whether to stop.
 */
export const fakeApp = ({ bytes = 'input bytes', stop = () => false }: { bytes?: string; stop?: () => boolean } = {}) => {
  const calls: AppCall[] = []
  const uploads: { job: string; path: string; type: string; text: string }[] = []
  const app: AppClient = {
    register: async () => ({ runner: { id: 'runner-1', name: 'Builder', tenant: '1' }, token: 'pbr_own' }),
    claim: async () => ({ order: 'none' }),
    heartbeat: async (job) => {
      calls.push({ call: 'heartbeat', job })
      return { stop: stop() }
    },
    log: async (job, lines) => {
      calls.push({ call: 'log', job, body: lines })
      return {}
    },
    complete: async (job, completion: JobCompletion) => {
      calls.push({ call: 'complete', job, body: completion })
      return {}
    },
    build: async (report) => {
      calls.push({ call: 'build', body: report })
      return { id: 'build-1' }
    },
    download: async (address, file) => {
      calls.push({ call: 'download', body: address })
      await writeFile(file, bytes)
    },
    upload: async (job, at, file, type): Promise<StoredFile> => {
      const text = await readFile(file, 'utf8')
      uploads.push({ job, path: at, type, text })
      calls.push({ call: 'upload', job, body: at })
      return { configuration: 'videos', path: `converted/${at}`, name: path.basename(at), type, size: text.length }
    },
  }
  return { app, calls, uploads }
}

/** The FFmpeg step's job, converting a stored video, as a claim gives it. */
export const convertJob = (changes: Partial<RunnerJob> = {}): RunnerJob => ({
  id: '0b6f2f8e-1111-4222-8333-944445555666',
  step: 'custom:ffmpeg_convert:1',
  input: { video: { configuration: 'videos', path: 'in/sample.mp4', name: 'sample.mp4', type: 'video/mp4', size: 11 }, height: 720, codec: 'h264', store: { configuration: 'videos' } },
  deadline: new Date(Date.now() + 60_000).toISOString(),
  heartbeat_seconds: 10,
  lease_seconds: 30,
  files: [{ input: 'video', name: 'sample.mp4', type: 'video/mp4', size: 11, url: '/api/runners/v1/jobs/0b6f2f8e-1111-4222-8333-944445555666/inputs/video' }],
  output_files: ['video'],
  build: { dockerfile: 'FROM debian:bookworm-slim\nCOPY convert.sh /usr/local/bin/convert\n', files: { 'convert.sh': '#!/bin/sh\n' }, command: ['convert'] },
  command: ['convert'],
  ...changes,
})

/** A work folder of its own and the runner's settings with it, removed by `remove`. */
export const testSettings = async (): Promise<{ settings: Settings; remove: () => Promise<void> }> => {
  const dir = await mkdtemp(path.join(tmpdir(), 'protobase-runner-test-'))
  return {
    settings: { slots: 2, cpus: 2, memory_mb: 2048, pids: 256, tmp_mb: 256, work_dir: path.join(dir, 'work'), engine: 'docker', build: true, build_timeout_seconds: 60 },
    remove: () => rm(dir, { recursive: true, force: true }),
  }
}
