import { devAddress, devPort } from '../dev/dev-port'
import type { MergedConfig } from './merge-config'

/**
 * The config of a local tool command that builds sign-in, such as `users create`: with no `url`, the address
 * `protobase dev` serves the project on, its kept port, else one picked and kept now so a later `protobase dev` serves
 * there. Without sign-in, or with a `url`, the config as it is.
 */
export const withDevUrl = async (config: MergedConfig, projectDir: string, port = devPort): Promise<MergedConfig> => {
  if (!config.auth || config.url) return config
  return { ...config, url: devAddress(await port(projectDir, undefined)) }
}
