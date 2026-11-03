import type { MergedConfig } from './merge-config'

/** Whether the app keeps tables its users add: the one reading of `userTables`, after `checkUserTables`. */
export const userTablesOn = (config: Pick<MergedConfig, 'userTables'>) => config.userTables === true

/**
 * Refuses a `userTables` that is no boolean, and user tables in an API that trusts the organization tokens of an auth
 * server elsewhere (`authenticate.organizations` without `auth.organizations`): it cannot read who owns or manages an
 * organization, which decides who sees its tables. With the app's own organizations, each keeps its own tables.
 */
export const checkUserTables = (config: MergedConfig) => {
  const value: unknown = config.userTables
  if (value !== undefined && typeof value !== 'boolean') throw new Error(`userTables is ${JSON.stringify(value)}; it takes true or false`)
  if (userTablesOn(config) && config.authenticate?.organizations && !(config.auth && config.auth.organizations)) {
    throw new Error("userTables and authenticate.organizations are both on without auth.organizations; tables users add need the app's own organizations, so turn one of them off")
  }
  return config
}
