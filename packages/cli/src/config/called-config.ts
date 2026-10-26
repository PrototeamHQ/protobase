import type { ConfigEnv, ConfigInput, ProtobaseConfig } from '@protobase/config'
import { resolveEnvValues } from './env-values'

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** The config `input` describes for `configEnv`: itself, or what its function returns, with its `$env` values read. */
export const calledConfig = async (input: ConfigInput, configEnv: ConfigEnv, label: string): Promise<ProtobaseConfig> => {
  const config = typeof input === 'function' ? await input(configEnv) : input
  if (!isObject(config)) throw new Error(`${label} must describe a config: an object, or in TypeScript a function that returns one`)
  return resolveEnvValues(config, configEnv.env, label) as ProtobaseConfig
}
