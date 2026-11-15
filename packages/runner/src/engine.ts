import { createHash } from 'node:crypto'
import { customStepOf } from '@protobase/workflows'
import type { EngineName, Settings } from './config'
import type { Exec, ExecOptions } from './exec'

/** The label naming the custom step version an image is of, `custom:<name>:<version>`, which the runner advertises. */
export const stepLabel = 'org.protobase.step'

/** The label naming the app and tenant an image is of, so runners of other apps on the machine never take it for theirs. */
export const appLabel = 'org.protobase.app'

const hex = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 16)

/** Who an image is for: the app the runner registered with and its tenant. */
export type Identity = { url: string; tenant: string | null }

/** The key of the app and tenant, the value of their images' `org.protobase.app` label. */
export const appKey = ({ url, tenant }: Identity) => hex(`${url}\n${tenant ?? ''}`)

/** The image of a custom step version: `protobase-custom-<hash of app, tenant and step>:<version>`. */
export const imageTag = (identity: Identity, step: string) => {
  const found = customStepOf(step)
  if (!found) throw new Error(`${step} is no custom step version`)
  return `protobase-custom-${hex(`${identity.url}\n${identity.tenant ?? ''}\n${found.name}`)}:${found.version}`
}

/** What the container sees: its input folder, read-only, its output folder, and `input.json` in the first. */
export const containerPaths = { input: '/protobase/in/input.json', in: '/protobase/in', out: '/protobase/out' }

/**
 * The command line of a job's container, hardened: a fresh container, removed after it, named so the runner can kill
 * it; no network; a read-only root with a small `/tmp` that runs nothing; every capability dropped, no new privileges,
 * an unprivileged user whatever the image says; process, memory (no swap beyond it) and CPU limits; only the job's
 * input folder, read-only, and its output folder, each relabelled (`z`) so SELinux lets the container use them; and the
 * contract's variables. The values of `env` stay off the command
 * line: each is named, and Docker and Podman take it from the runner's environment.
 */
export const runArgs = ({ name, image, command, work, settings, env }: { name: string; image: string; command?: readonly string[]; work: string; settings: Pick<Settings, 'cpus' | 'memory_mb' | 'pids' | 'tmp_mb'>; env: readonly string[] }) => [
  'run', '--rm', '--name', name,
  '--network', 'none',
  '--read-only', '--tmpfs', `/tmp:rw,noexec,nosuid,size=${settings.tmp_mb}m`,
  '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
  '--pids-limit', String(settings.pids), '--memory', `${settings.memory_mb}m`, '--memory-swap', `${settings.memory_mb}m`, '--cpus', String(settings.cpus),
  '--user', '65532:65532',
  '-v', `${work}/in:${containerPaths.in}:ro,z`, '-v', `${work}/out:${containerPaths.out}:z`,
  '-e', `PROTOBASE_INPUT=${containerPaths.input}`, '-e', `PROTOBASE_IN=${containerPaths.in}`, '-e', `PROTOBASE_OUT=${containerPaths.out}`,
  ...env.flatMap((variable) => ['-e', variable]),
  image,
  ...(command ?? []),
]

/**
 * The command line that removes the output folder of a job's folder (`work`), with all a job's container left in it
 * that the runner's own user may not remove, folders it made unwritable included: the cleaner image's `rm`, as root in
 * the container, which under rootless Docker or Podman is the runner's own user, with every capability dropped but
 * the two removing needs, `DAC_OVERRIDE` and `FOWNER`, hardened and limited as a job is, with only that folder. It is
 * named, so the runner can kill and remove it.
 */
export const cleanArgs = ({ name, image, work, settings }: { name: string; image: string; work: string; settings: Pick<Settings, 'cpus' | 'memory_mb' | 'pids'> }) => [
  'run', '--rm', '--name', name,
  '--network', 'none', '--read-only',
  '--cap-drop', 'ALL', '--cap-add', 'DAC_OVERRIDE', '--cap-add', 'FOWNER', '--security-opt', 'no-new-privileges',
  '--pids-limit', String(settings.pids), '--memory', `${settings.memory_mb}m`, '--memory-swap', `${settings.memory_mb}m`, '--cpus', String(settings.cpus),
  '--user', '0:0',
  '-v', `${work}:/protobase/work:z`,
  '--entrypoint', 'rm',
  image,
  '-rf', '--', '/protobase/work/out',
]

/** The command line that builds a version's image from its folder, labelled with its step and its app. */
export const buildArgs = ({ tag, step, app, dockerfile, context }: { tag: string; step: string; app: string; dockerfile: string; context: string }) => ['build', '--tag', tag, '--label', `${stepLabel}=${step}`, '--label', `${appLabel}=${app}`, '--file', dockerfile, context]

/** How long listing the runner's images may take before a claim goes on without them. */
export const imagesTimeoutMs = 30_000

/** Docker or Podman, driven through its command line, which is the same for both. */
export const engine = (exec: Exec, name: EngineName) => ({
  name,
  /**
   * The custom step versions whose images of this app and tenant are here, by their labels; none when the engine does
   * not answer within `imagesTimeoutMs`, or `signal` stops the runner meanwhile, so a stalled engine never holds a claim
   * or a shutdown.
   */
  images: async (app: string, signal?: AbortSignal) => {
    const bounded = { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(imagesTimeoutMs)]) : AbortSignal.timeout(imagesTimeoutMs) }
    const listed = await exec(name, ['image', 'ls', '--filter', `label=${appLabel}=${app}`, '--format', '{{.ID}}'], bounded)
    const ids = [...new Set(listed.stdout.split('\n').map((line) => line.trim()).filter(Boolean))]
    if (listed.code !== 0 || ids.length === 0) return []
    const labels = await exec(name, ['image', 'inspect', '--format', `{{index .Config.Labels "${stepLabel}"}}`, ...ids], bounded)
    if (labels.code !== 0) return []
    return [...new Set(labels.stdout.split('\n').map((line) => line.trim()).filter((step) => customStepOf(step) !== undefined))]
  },
  has: async (tag: string, options: ExecOptions = {}) => (await exec(name, ['image', 'inspect', '--format', '{{.Id}}', tag], options)).code === 0,
  /** The image's digest, its content's ID. */
  digest: async (tag: string) => {
    const found = await exec(name, ['image', 'inspect', '--format', '{{.Id}}', tag])
    return found.code === 0 ? found.stdout.trim() : undefined
  },
  build: (args: readonly string[], options: ExecOptions) => exec(name, args, options),
  run: (args: readonly string[], options: ExecOptions) => exec(name, args, options),
  kill: (container: string, options: ExecOptions = {}) => exec(name, ['kill', container], options),
  remove: (container: string, options: ExecOptions = {}) => exec(name, ['rm', '-f', container], options),
  pull: (image: string, options: ExecOptions) => exec(name, ['pull', image], options),
  /** Removes what a job's container left in its output folder (`cleanArgs`). */
  clean: (given: Parameters<typeof cleanArgs>[0], options: ExecOptions) => exec(name, cleanArgs(given), options),
})

export type Engine = ReturnType<typeof engine>

/**
 * Which engine works here for the user, `chosen` or else Docker first, and whether that one builds images; undefined
 * when none works.
 */
export const findEngine = async (exec: Exec, chosen?: EngineName): Promise<{ engine: EngineName; builds: boolean } | undefined> => {
  for (const name of chosen ? [chosen] : (['docker', 'podman'] as const)) {
    if ((await exec(name, ['version'])).code !== 0) continue
    return { engine: name, builds: (await exec(name, ['build', '--help'])).code === 0 }
  }
  return undefined
}
