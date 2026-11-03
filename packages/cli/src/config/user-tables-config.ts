import type { MergedConfig } from './merge-config'

/** Whether the app keeps tables its users add: the one reading of `userTables`, after `checkUserTables`. */
export const userTablesOn = (config: Pick<MergedConfig, 'userTables'>) => config.userTables === true

/**
 * Refuses a `userTables` that is no boolean, and user tables together with organizations, whose definitions and records
 * are not kept per organization. Organizations are on for any truthy `auth.organizations`, as sign-in reads it.
 */
export const checkUserTables = (config: MergedConfig) => {
  const value: unknown = config.userTables
  if (value !== undefined && typeof value !== 'boolean') throw new Error(`userTables is ${JSON.stringify(value)}; it takes true or false`)
  if (userTablesOn(config) && config.auth && config.auth.organizations) {
    throw new Error('userTables and auth.organizations are both on; tables users add are not kept per organization yet, so turn one of them off')
  }
  return config
}
