import { availableParallelism } from 'node:os'
import { appClient, type Fetch } from './app'
import { configPath, defaultWorkDir, readConfig, settingFlags, settingsOf, writeConfig, type Settings } from './config'
import { engine, findEngine } from './engine'
import type { Exec } from './exec'
import { kinds, platform, runLoop } from './loop'
import packageJson from '../package.json' with { type: 'json' }

export const usage = `protobase-runner ${packageJson.version}: runs an app's custom steps in containers.

  protobase-runner register --url <app> --token pbr_once_... [settings]
      Registers this machine with the app's one-time token, keeping its own in
      $XDG_CONFIG_HOME/protobase-runner/config.json (~/.config by default).
  protobase-runner run
      Claims the app's jobs and runs them, until stopped.
  protobase-runner version

Settings, kept by register: --slots <jobs at once, default half the CPUs>, --cpus <per job, 2>,
--memory-mb <per job, 2048>, --pids <per job, 256>, --tmp-mb <per job, 256>, --work-dir <folder>,
--engine docker|podman, --build true|false, --build-timeout-seconds <1800>.`

export type CliInput = { exec: Exec; env: Record<string, string | undefined>; say: (line: string) => void; fetch?: Fetch; signal?: AbortSignal }

// `--name value` pairs, each name once.
const flagsOf = (args: readonly string[]) => {
  const flags: Record<string, string> = {}
  for (let at = 0; at < args.length; at += 2) {
    const name = args[at]!
    const value = args[at + 1]
    if (!name.startsWith('--') || value === undefined) throw new Error(`${name} needs a value\n\n${usage}`)
    flags[name] = value
  }
  return flags
}

/**
 * The runner's command line: `register` exchanges a one-time token for the runner's own and keeps it with the settings,
 * `run` runs the loop until `signal` aborts, saying what it does, `version` gives its version. Answers what to print.
 */
export const cli = async (args: readonly string[], { exec, env, say, fetch, signal }: CliInput): Promise<string | undefined> => {
  const [command, ...rest] = args
  if (command === 'version' || command === '--version') return packageJson.version
  if (command === 'register') {
    const flags = flagsOf(rest)
    const known = ['--url', '--token', ...Object.keys(settingFlags)]
    const unknown = Object.keys(flags).find((name) => !known.includes(name))
    if (unknown) throw new Error(`${unknown} is not an option of register\n\n${usage}`)
    const url = flags['--url']?.replace(/\/+$/, '')
    const token = flags['--token']
    if (!url || !/^https?:\/\//.test(url)) throw new Error('Give the app\'s address: --url https://app.example.com')
    if (!token) throw new Error('Give the runner\'s one-time registration token: --token pbr_once_...')
    const found = await findEngine(exec)
    const given = Object.fromEntries(Object.entries(flags).flatMap(([name, value]) => (settingFlags[name] ? [[settingFlags[name], value]] : []))) as Partial<Record<keyof Settings, string>>
    if (!found && !given.engine) throw new Error('Neither docker nor podman works for this user: install one, rootless is recommended, then register again')
    const settings = settingsOf(given, { cpus: availableParallelism(), engine: found?.engine ?? 'docker', builds: found?.builds ?? false, workDir: defaultWorkDir(env) })
    const registered = await appClient({ url, ...(fetch && { fetch }) }).register({ token, platform: platform(), kinds: kinds(settings) })
    const file = configPath(env)
    await writeConfig(file, { url, token: registered.token, runner: { id: registered.runner.id, name: registered.runner.name, tenant: registered.runner.tenant ?? null }, settings })
    return `Registered as ${registered.runner.name} (${registered.runner.id}), running ${settings.slots} ${settings.slots === 1 ? 'job' : 'jobs'} at once with ${settings.engine}${settings.build ? ', building images' : ''}; its config is ${file}`
  }
  if (command === 'run') {
    if (rest.length > 0) throw new Error(`run takes no options; its settings are in ${configPath(env)}`)
    const config = await readConfig(configPath(env))
    say(`Running for ${config.url} as ${config.runner.name}, ${config.settings.slots} ${config.settings.slots === 1 ? 'job' : 'jobs'} at once with ${config.settings.engine}`)
    await runLoop({
      app: appClient({ url: config.url, token: config.token, ...(fetch && { fetch }) }),
      engine: engine(exec, config.settings.engine),
      settings: config.settings,
      identity: { url: config.url, tenant: config.runner.tenant },
      say,
      signal: signal ?? new AbortController().signal,
    })
    return
  }
  throw new Error(usage)
}
