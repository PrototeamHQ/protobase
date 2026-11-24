import { organizationsEnabled, organizationsInput, settingsStoreNames, type OrganizationsInput, type StoreNames } from '@protobase/server/internal'
import type { MergedConfig } from '../../config/merge-config'

/**
 * The auth store the config asks for: its names, whether organizations are on, and their default organization and the
 * role of the users there already, which the steps write rows from (`organizations`, undefined without a default).
 */
export type AuthTarget = { names: StoreNames; organizationsOn: boolean; organizations: OrganizationsInput | undefined }

/** What the config says of organizations, as the snapshot records it; off without sign-in. */
export const organizationsNow = (target: AuthTarget | undefined) => ({ on: target?.organizationsOn ?? false, ...(target?.organizations && { default: target.organizations.default }) })

/** The config's auth store, from its `auth` and whether auth/hooks.ts gives users their ids; `undefined` with sign-in off. */
export const authTarget = async (config: MergedConfig): Promise<AuthTarget | undefined> => {
  if (!config.auth) return
  const hooks = await config.authFiles?.module('auth/hooks.ts')?.()
  return {
    names: settingsStoreNames(config.auth, typeof hooks?.generateUserId === 'function'),
    organizationsOn: organizationsEnabled(config.auth.organizations),
    organizations: organizationsInput(config.auth.organizations),
  }
}
