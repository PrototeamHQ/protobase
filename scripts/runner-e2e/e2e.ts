// The runner's end-to-end test, run by remote.sh on a Linux test machine with Docker: an app with custom steps and a
// local storage configuration, the compiled runner installed by the app's own install script, a workflow that converts
// a 1920x1080 sample video to height 720 with FFmpeg in a custom step, and ffprobe on the stored result in the same
// image, which must print h264,1280,720. It prints its timings and exits 0 only when that holds.
import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { chmod, mkdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { serve } from '@hono/node-server'
import { Kysely, PostgresDialect, sql } from 'kysely'
import pg from 'pg'
import { defineRoles } from '@protobase/schema'
import { configExports, createAdmin, jobsSchemaMigration, startJobs, workflowsMigration, type WorkflowsOptions } from '@protobase/server'
import { localFiles, workflowsModule } from '@protobase/server/internal'
import { partsOfDefinition, type Definition } from '@protobase/workflows'

const dir = process.env.E2E_DIR!
const databaseUrl = process.env.E2E_DATABASE_URL!
const runnerBinary = process.env.E2E_RUNNER!
if (!dir || !databaseUrl || !runnerBinary) throw new Error('remote.sh sets E2E_DIR, E2E_DATABASE_URL and E2E_RUNNER')

const step = 'custom:ffmpeg_convert:1'
const started = Date.now()
const say = (line: string) => console.log(`[e2e ${((Date.now() - started) / 1000).toFixed(1)}s] ${line}`)
const seconds = (from: Date | number, to: Date | number) => ((new Date(to).getTime() - new Date(from).getTime()) / 1000).toFixed(1)
// A command run beside the app, never blocking it: the app answers the runner meanwhile.
const command = (program: string, args: string[], env: Record<string, string | undefined> = process.env) =>
  new Promise<{ status: number; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(program, args, { env, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString('utf8')))
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')))
    child.on('close', (status) => resolve({ status: status ?? 1, stdout, stderr }))
  })
const docker = async (args: string[]) => {
  const ran = await command('docker', args)
  if (ran.status !== 0) throw new Error(`docker ${args.join(' ')} failed: ${ran.stderr}`)
  return ran.stdout.trim()
}
const waitFor = async <T>(what: string, minutes: number, found: () => Promise<T | undefined>) => {
  const until = Date.now() + minutes * 60_000
  for (;;) {
    const value = await found()
    if (value !== undefined) return value
    if (Date.now() > until) throw new Error(`${what} did not happen within ${minutes} minutes`)
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
}

// The step of the report's FFmpeg example: a pinned static FFmpeg 7.1.1 with jq, converting to a height in H.264 or VP9.
const convertScript = `#!/bin/sh
set -eu
in=$(jq -r .video.path "$PROTOBASE_INPUT")
height=$(jq -r '.height // 720' "$PROTOBASE_INPUT")
codec=$(jq -r '.codec // "h264"' "$PROTOBASE_INPUT")
if ! ffprobe -v error -select_streams v:0 -show_entries stream=codec_type -of csv=p=0 "$in" | grep -q video; then
  printf '{ "error": "UnsupportedInput", "cause": "%s has no video stream FFmpeg can read" }' "$(basename "$in")" > "$PROTOBASE_OUT/error.json"
  exit 1
fi
if [ "$codec" = vp9 ]; then
  out=video-$height.webm
  ffmpeg -nostdin -loglevel warning -stats -i "$in" -vf "scale=-2:$height" -c:v libvpx-vp9 -deadline realtime -cpu-used 8 -b:v 2M -c:a libopus "$PROTOBASE_OUT/$out"
else
  out=video-$height.mp4
  ffmpeg -nostdin -loglevel warning -stats -i "$in" -vf "scale=-2:$height" -c:v libx264 -preset veryfast -c:a aac -movflags +faststart "$PROTOBASE_OUT/$out"
fi
duration=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$PROTOBASE_OUT/$out")
jq -n --arg video "$out" --argjson duration "$duration" '{ video: $video, duration_seconds: $duration }' > "$PROTOBASE_OUT/output.json"
`
const ffmpegConvert = {
  name: 'ffmpeg_convert',
  label: 'Convert a video with FFmpeg 7.1.1',
  description: 'Scales a video to a height and encodes it as H.264 in MP4 or VP9 in WebM.',
  container: {
    dockerfile: 'FROM mwader/static-ffmpeg:7.1.1 AS ffmpeg\nFROM debian:bookworm-slim\nRUN apt-get update && apt-get install -y --no-install-recommends jq && rm -rf /var/lib/apt/lists/*\nCOPY --from=ffmpeg /ffmpeg /ffprobe /usr/local/bin/\nCOPY convert.sh /usr/local/bin/convert\nRUN chmod 755 /usr/local/bin/convert\nUSER 65532:65532\n',
    files: { 'convert.sh': convertScript },
    command: ['convert'],
  },
  input: {
    type: 'object',
    required: ['video'],
    properties: {
      video: { 'x-file': true, description: 'the video to convert' },
      height: { type: 'integer', enum: [480, 720, 1080], default: 720 },
      codec: { type: 'string', enum: ['h264', 'vp9'], default: 'h264' },
    },
  },
  output: { type: 'object', required: ['video'], properties: { video: { 'x-file': true }, duration_seconds: { type: 'number' } } },
  error_prefix: 'Ffmpeg',
  errors: { UnsupportedInput: 'the file is not a video FFmpeg can read' },
}

const converting = {
  trigger: { manual: {} },
  stateMachine: {
    QueryLanguage: 'JSONata',
    StartAt: 'Convert',
    States: {
      Convert: {
        Type: 'Task',
        Resource: step,
        Arguments: { video: '{% $states.context.Execution.Input.video %}', height: 720, store: { configuration: 'videos', path: 'converted' } },
        TimeoutSeconds: 1800,
        HeartbeatSeconds: 60,
        End: true,
      },
    },
  },
}

const roles = defineRoles<'workflows' | 'workflow_versions' | 'workflow_runs' | 'workflow_custom_steps' | 'workflow_custom_step_versions' | 'workflow_runners' | 'workflow_custom_step_jobs' | 'workflow_custom_step_builds' | 'storage_configurations'>({
  keeper: ['workflows.*', 'workflow_versions.read', 'workflow_runs.*', 'workflow_custom_steps.*', 'workflow_custom_step_versions.read', 'workflow_runners.*', 'workflow_custom_step_jobs.read', 'workflow_custom_step_builds.read', 'storage_configurations.*'],
})

process.env.PROTOBASE_SECRET = randomBytes(32).toString('base64url')
process.env.PROTOBASE_ENCRYPTION_KEY = randomBytes(32).toString('base64')

const pool = new pg.Pool({ connectionString: databaseUrl, max: 10 })
const db = new Kysely<any>({ dialect: new PostgresDialect({ pool }) })
const storageRoot = path.join(dir, 'storage')
const workflows: WorkflowsOptions = { savedByRoles: async () => ['keeper'], customSteps: true, storage: { root: storageRoot } }
const children: ChildProcess[] = []
let exitCode = 1

try {
  // The custom steps' and runners' tables index names for search, as every app's database can.
  await pool.query('create extension if not exists pg_trgm')
  await pool.query((await jobsSchemaMigration(db))!)
  await pool.query((await workflowsMigration(db, workflows))!)
  const { resources, views } = configExports(workflowsModule(workflows))
  const admin = createAdmin({
    resources, views, db, workflows,
    files: { providers: { private: localFiles({ dir: path.join(dir, 'private') }) }, secret: randomBytes(32).toString('base64url') },
    authenticate: () => ({ user: { id: 'ada', roles: ['keeper'] }, tenant: '1' }),
    options: { roles },
  })
  const jobs = await startJobs({ db, jobs: admin.jobs, pollSeconds: 0.5, shutdownSeconds: 5, onError: (error) => say(`job error: ${String(error)}`) })
  const server = await new Promise<ReturnType<typeof serve>>((resolve) => {
    const listening = serve({ fetch: admin.fetch, hostname: '127.0.0.1', port: 0 }, () => resolve(listening))
  })
  const port = (server.address() as { port: number }).port
  const origin = `http://127.0.0.1:${port}`
  say(`app on ${origin}`)
  const api = async (method: string, at: string, body?: unknown) => {
    const response = await fetch(`${origin}${at.startsWith('/api/') ? at : `/api/v1${at}`}`, { method, headers: { 'content-type': 'application/json', 'if-match': '*' }, ...(body !== undefined && { body: JSON.stringify(body) }) })
    const text = await response.text()
    if (!response.ok) throw new Error(`${method} ${at}: ${response.status} ${text}`)
    return JSON.parse(text) as Record<string, unknown>
  }

  try {
    await api('POST', '/storage_configurations', { name: 'videos', kind: 'local', dir: 'videos' })
    await api('POST', '/workflow_custom_steps', ffmpegConvert)
    const runner = await api('POST', '/workflow_runners', { name: 'dev1' })
    const issued = await api('POST', `/api/workflows/runners/${String(runner.id)}/registration`)
    say(`registration command: ${String(issued.command).replace(String(issued.token), 'pbr_once_...')}`)

    // The app's own install script, as the command gives it, with the runner just built and no service.
    const config = path.join(dir, 'config')
    const install = await command('sh', ['-c', `curl -fsSL ${origin}/api/runners/install.sh | sh -s -- --token "$TOKEN" --binary-url "file://${runnerBinary}" --bin-dir "${path.join(dir, 'bin')}" --service false --slots 1 --work-dir "${path.join(dir, 'work')}"`], { ...process.env, TOKEN: String(issued.token), XDG_CONFIG_HOME: config })
    process.stdout.write(install.stdout)
    process.stderr.write(install.stderr)
    if (install.status !== 0) throw new Error(`the install script failed with ${install.status}`)
    const mode = ((await stat(path.join(config, 'protobase-runner', 'config.json'))).mode & 0o777).toString(8)
    say(`runner installed, its config mode ${mode}`)

    const log = createWriteStream(path.join(dir, 'runner.log'))
    const machine = spawn(path.join(dir, 'bin', 'protobase-runner'), ['run'], { env: { ...process.env, XDG_CONFIG_HOME: config }, stdio: ['ignore', 'pipe', 'pipe'] })
    children.push(machine)
    await writeFile(path.join(dir, 'runner.pid'), String(machine.pid))
    for (const stream of [machine.stdout, machine.stderr]) {
      stream.on('data', (chunk: Buffer) => {
        log.write(chunk)
        for (const line of chunk.toString('utf8').split('\n').filter(Boolean)) console.log(`[runner] ${line}`)
      })
    }

    // Publishing it has the runner prepare the step's image before any run.
    const definition = Object.fromEntries(Object.entries(partsOfDefinition(converting as unknown as Definition)).filter(([, value]) => value !== null))
    const workflow = await api('POST', '/workflows', { name: 'Convert videos', ...definition })
    await api('PATCH', `/workflows/${String(workflow.id)}`, { enabled_version: 1 })
    say('published; the runner prepares the image')
    const build = await waitFor('the build', 20, async () => {
      const { rows } = await sql<{ status: string; started_at: Date; finished_at: Date | null; digest: string | null; log: string | null }>`select status, started_at, finished_at, digest, log from workflows.custom_step_builds order by started_at desc limit 1`.execute(db)
      const found = rows[0]
      return found && found.status !== 'building' ? found : undefined
    })
    if (build.status !== 'ready') throw new Error(`the build failed:\n${build.log}`)
    say(`build ready in ${seconds(build.started_at, build.finished_at!)} s, ${build.digest}`)
    const image = (await docker(['image', 'ls', '--filter', `label=org.protobase.step=${step}`, '--format', '{{.Repository}}:{{.Tag}}'])).split('\n')[0]!
    say(`image ${image}, labelled ${await docker(['image', 'inspect', '--format', '{{index .Config.Labels "org.protobase.step"}}', image])}`)

    // The sample: 10 s of 1920x1080 at 30 frames from FFmpeg's test source, with a tone, stored in the configuration.
    const videos = path.join(storageRoot, 'videos')
    await mkdir(path.join(videos, 'in'), { recursive: true })
    await chmod(path.join(videos, 'in'), 0o777)
    const sampleStart = Date.now()
    await docker(['run', '--rm', '--network', 'none', '--user', '0:0', '-v', `${path.join(videos, 'in')}:/w`, image, 'ffmpeg', '-nostdin', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '10', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', '/w/sample.mp4'])
    const size = (await stat(path.join(videos, 'in', 'sample.mp4'))).size
    const probe = (file: string) => docker(['run', '--rm', '--network', 'none', '--user', '0:0', '-v', `${videos}:/w:ro`, image, 'ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height', '-of', 'csv=p=0', `/w/${file}`])
    say(`sample made in ${seconds(sampleStart, Date.now())} s: ${size} bytes, ${await probe('in/sample.mp4')}`)

    const run = await api('POST', '/workflow_runs', { workflow_id: workflow.id, input: { video: { configuration: 'videos', path: 'in/sample.mp4', name: 'sample.mp4', type: 'video/mp4', size } } })
    say(`run ${String(run.id)} started`)
    const ended = await waitFor('the run', 20, async () => {
      const { rows } = await sql<{ status: string; output: { video?: { path: string; size: number } } | null; error: string | null; cause: string | null }>`select status, output, error, cause from workflows.runs where id = ${String(run.id)}`.execute(db)
      return rows[0] && ['succeeded', 'failed'].includes(rows[0].status) ? rows[0] : undefined
    })
    const { rows: [job] } = await sql<{ queued_at: Date; claimed_at: Date; finished_at: Date; logs: { message: string }[] }>`select queued_at, claimed_at, finished_at, logs from workflows.custom_step_jobs where run_id = ${String(run.id)}`.execute(db)
    if (ended.status !== 'succeeded') throw new Error(`the run failed: ${ended.error}: ${ended.cause}`)
    say(`run succeeded: ${JSON.stringify(ended.output)}`)
    say(`job queued to claimed ${seconds(job!.queued_at, job!.claimed_at)} s, claimed to finished (download, conversion, upload) ${seconds(job!.claimed_at, job!.finished_at)} s; its last log line: ${job!.logs.at(-1)?.message}`)
    const probed = await probe(ended.output!.video!.path)
    say(`ffprobe of the stored output: ${probed}`)
    if (probed !== 'h264,1280,720') throw new Error(`expected h264,1280,720, got ${probed}`)
    say('PASS')
    exitCode = 0
  } finally {
    for (const child of children) child.kill('SIGTERM')
    await new Promise((resolve) => setTimeout(resolve, 1000))
    await jobs.stop()
    server.close()
  }
} catch (error) {
  say(`FAIL: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`)
} finally {
  for (const child of children) child.kill('SIGKILL')
  await db.destroy().catch(() => {})
}
process.exit(exitCode)
