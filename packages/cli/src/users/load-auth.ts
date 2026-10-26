import pg from 'pg'
import { removeDevicesWithUsers, removeHistoryWithUsers, type AdminAuth } from '@protobase/server'
import { projectAuth } from '../config/build-project'
import { projectNotifications } from '../config/project-parts'
import { loadSourceConfig } from '../config/source-config'
import { loadNearestEnvFile } from '../dev/env'
import { openAppDatabase } from '../project/pg-db'

/**
 * The sign-in of the project in `projectDir`, built from its config's `auth` over DATABASE_URL, with only the plugins
 * it turns on. With a device or history store of the app's own (notifications/store.ts, notifications/history-store.ts),
 * deleting a user removes their devices or history from it too; the built-in tables go with the user by their foreign
 * keys.
 */
export const loadProjectAuth = async (projectDir: string): Promise<AdminAuth> => {
  loadNearestEnvFile(projectDir)
  const config = await loadSourceConfig(projectDir, { command: 'tool' })
  if (!config.auth) throw new Error('Sign-in is off (`auth: false` in the config), so the app has no users to manage')
  if (!process.env.DATABASE_URL) throw new Error('No database: set DATABASE_URL')
  const [auth, notifications] = await Promise.all([projectAuth(config, openAppDatabase(pg, process.env.DATABASE_URL)), projectNotifications(config)])
  if (notifications?.store) removeDevicesWithUsers(auth!, notifications.store)
  if (notifications?.historyStore) removeHistoryWithUsers(auth!, notifications.historyStore)
  return auth!
}
