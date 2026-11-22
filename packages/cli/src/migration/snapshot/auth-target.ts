import { settingsStoreNames, type StoreNames } from '@protobase/server/internal'
import type { MergedConfig } from '../../config/merge-config'

/** The auth store the config asks for: its names, and whether organizations are on. */
export type AuthTarget = { names: StoreNames; organizationsOn: boolean }

/** The config's auth store, from its `auth` and whether auth/hooks.ts gives users their ids; `undefined` with sign-in off. */
export const authTarget = async (config: MergedConfig): Promise<AuthTarget | undefined> => {
  if (!config.auth) return
  const hooks = await config.authFiles?.module('auth/hooks.ts')?.()
  return { names: settingsStoreNames(config.auth, typeof hooks?.generateUserId === 'function'), organizationsOn: Boolean(config.auth.organizations) }
}
