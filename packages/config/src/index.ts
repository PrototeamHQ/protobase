// `@protobase/config`: `defineConfig` and the types of `protobase.config.ts`, and nothing that runs besides it, so
// reading a config loads no more than this module and the config itself.
import type { ConfigFunction, ProtobaseConfig } from './config'

export type { AuthConfig, ConfigCommand, ConfigEnv, ConfigFunction, ConfigInput, FilesConfig, ProtobaseConfig } from './config'

/**
 * Types `protobase.config.ts`'s default export and returns it as it is: a config, or a function of the command and the
 * environment that returns one, at once or as a promise.
 */
export function defineConfig(config: ProtobaseConfig): ProtobaseConfig
export function defineConfig(config: ConfigFunction): ConfigFunction
export function defineConfig(config: ProtobaseConfig | ConfigFunction) {
  return config
}
