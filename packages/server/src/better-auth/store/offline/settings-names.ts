import type { AuthSettings } from '../../auth-settings'
import { modulesOf } from '../../names/modules-on'
import { organizationsEnabled } from '../../organizations/options'
import { resolveNames } from '../../names/resolve-names'
import { userTable } from '../../user-table'
import type { StoreNames } from '../store-names'

/**
 * The store's names from the app's `auth` settings alone, the modules its features turn on, as the app's Better Auth
 * resolves them, without building it:
 * no database, URL or secret. `ownUserIds`: the app's hooks give new users their ids (`generateUserId` in
 * auth/hooks.ts), which the hooks then decide over `generateUserId: 'uuid'`.
 */
export const settingsStoreNames = (settings: Pick<AuthSettings, 'schema' | 'tables' | 'users' | 'generateUserId' | 'organizations' | 'mcp' | 'openIdProvider' | 'personalAccessTokens' | 'personalMail' | 'signInProviders' | 'signInDevices'>, ownUserIds = false): StoreNames => {
  const schema = settings.schema ?? 'auth'
  return {
    schema,
    names: resolveNames({ schema, tables: settings.tables, modules: modulesOf({ ...settings, organizations: organizationsEnabled(settings.organizations) }) }),
    users: userTable(settings.users),
    uuidIds: !ownUserIds && settings.generateUserId === 'uuid',
  }
}
