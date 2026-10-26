// `@protobase/config`: `defineConfig` and the types of `protobase.config.ts`, and nothing that runs besides it, so
// reading a config loads no more than this module and the config itself.
import type { JobDeclaration } from '@protobase/server'
import type { ConfigEnv, ConfigFunction, ProtobaseConfig } from './config'

export type { AuthConfig, ConfigCommand, ConfigEnv, ConfigFunction, ConfigInput, FilesConfig, ProtobaseConfig } from './config'

// The config with its jobs as written, so `typeof config` names each job and its arguments (`EnqueueJob`, `JobPayload`).
type WithJobs<Jobs> = Omit<ProtobaseConfig, 'jobs'> & { jobs?: Jobs }

/**
 * Types `protobase.config.ts`'s default export and returns it as it is: a config, or a function of the command and the
 * environment that returns one, at once or as a promise. Its type keeps the jobs as written, so
 * `EnqueueJob<typeof config>` of `@protobase/server` knows their names and arguments.
 */
export function defineConfig<const Jobs extends Record<string, JobDeclaration> = {}>(config: WithJobs<Jobs>): WithJobs<Jobs>
export function defineConfig<const Jobs extends Record<string, JobDeclaration> = {}>(config: (configEnv: ConfigEnv) => WithJobs<Jobs> | Promise<WithJobs<Jobs>>): (configEnv: ConfigEnv) => WithJobs<Jobs> | Promise<WithJobs<Jobs>>
export function defineConfig(config: ProtobaseConfig | ConfigFunction) {
  return config
}
