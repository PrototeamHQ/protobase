import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'

export const engines = ['docker', 'podman'] as const
export type EngineName = (typeof engines)[number]

/**
 * How the runner runs jobs: how many at once (`slots`), what each container may use (`cpus`, `memory_mb` with no swap
 * beyond it, `pids`, and `tmp_mb` of `/tmp`), where jobs' folders go (`work_dir`), which engine runs them, whether it
 * builds images, and how long a build may take.
 */
export type Settings = {
  slots: number
  cpus: number
  memory_mb: number
  pids: number
  tmp_mb: number
  work_dir: string
  engine: EngineName
  build: boolean
  build_timeout_seconds: number
}

/** What `register` keeps: the app, the runner's own token, who it is, and its settings. Readable by its user only. */
export type RunnerConfig = {
  url: string
  token: string
  runner: { id: string; name: string; tenant: string | null }
  settings: Settings
}

type Env = Record<string, string | undefined>

/** Where the config is kept: `$XDG_CONFIG_HOME/protobase-runner/config.json`, by default under `~/.config`. */
export const configPath = (env: Env) => path.join(env.XDG_CONFIG_HOME || path.join(homedir(), '.config'), 'protobase-runner', 'config.json')

/** Where jobs' and builds' folders go by default: `$XDG_CACHE_HOME/protobase-runner`, by default under `~/.cache`. */
export const defaultWorkDir = (env: Env) => path.join(env.XDG_CACHE_HOME || path.join(homedir(), '.cache'), 'protobase-runner')

/** The settings a flag sets, by its name: `--memory-mb` sets `memory_mb`. */
export const settingFlags: Record<string, keyof Settings> = {
  '--slots': 'slots',
  '--cpus': 'cpus',
  '--memory-mb': 'memory_mb',
  '--pids': 'pids',
  '--tmp-mb': 'tmp_mb',
  '--work-dir': 'work_dir',
  '--engine': 'engine',
  '--build': 'build',
  '--build-timeout-seconds': 'build_timeout_seconds',
}

const wholeSettings = ['slots', 'memory_mb', 'pids', 'tmp_mb', 'build_timeout_seconds'] as const

/**
 * The settings, from what the flags give (`given`, by setting) over the defaults: slots half the machine's CPUs, at
 * least 1; 2 CPUs, 2048 MB, 256 processes and 256 MB of `/tmp` per job; the engine found and whether it builds; builds
 * up to 30 minutes. A value that is not one is refused, naming its flag: whole numbers above 0, CPUs a number above 0,
 * an engine `docker` or `podman`, and `build` `true` or `false` only.
 */
export const settingsOf = (given: Partial<Record<keyof Settings, string>>, found: { cpus: number; engine: EngineName; builds: boolean; workDir: string }): Settings => {
  const flag = (key: keyof Settings) => Object.keys(settingFlags).find((name) => settingFlags[name] === key)!
  const settings: Settings = {
    slots: Math.max(1, Math.floor(found.cpus / 2)),
    cpus: 2,
    memory_mb: 2048,
    pids: 256,
    tmp_mb: 256,
    work_dir: found.workDir,
    engine: found.engine,
    build: found.builds,
    build_timeout_seconds: 1800,
  }
  for (const key of wholeSettings) {
    const value = given[key]
    if (value === undefined) continue
    if (!/^[1-9][0-9]*$/.test(value)) throw new Error(`${flag(key)} is a whole number above 0, not ${JSON.stringify(value)}`)
    settings[key] = Number(value)
  }
  if (given.cpus !== undefined) {
    const cpus = Number(given.cpus)
    if (!/^[0-9]+(\.[0-9]+)?$/.test(given.cpus) || !(cpus > 0)) throw new Error(`--cpus is a number above 0, such as 2 or 0.5, not ${JSON.stringify(given.cpus)}`)
    settings.cpus = cpus
  }
  if (given.work_dir !== undefined) settings.work_dir = path.resolve(given.work_dir)
  if (given.engine !== undefined) {
    if (!engines.includes(given.engine as EngineName)) throw new Error(`--engine is docker or podman, not ${JSON.stringify(given.engine)}`)
    settings.engine = given.engine as EngineName
  }
  if (given.build !== undefined) {
    if (given.build !== 'true' && given.build !== 'false') throw new Error(`--build is true or false, not ${JSON.stringify(given.build)}`)
    settings.build = given.build === 'true'
  }
  return settings
}

/** Writes the config readable and writable by its user only, in a folder only they may enter. */
export const writeConfig = async (file: string, config: RunnerConfig) => {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 })
  await writeFile(file, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 })
  await chmod(file, 0o600)
}

/** The config `register` wrote, or why there is none to run with. */
export const readConfig = async (file: string): Promise<RunnerConfig> => {
  const text = await readFile(file, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') throw new Error(`No runner is registered here: ${file} is missing. Run protobase-runner register --url <app> --token pbr_once_... first`)
    throw error
  })
  const config = JSON.parse(text) as RunnerConfig
  if (typeof config.url !== 'string' || typeof config.token !== 'string' || typeof config.settings !== 'object') throw new Error(`${file} is not a runner's config; register again`)
  return config
}
