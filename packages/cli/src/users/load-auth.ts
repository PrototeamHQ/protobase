import { existsSync } from 'node:fs'
import path from 'node:path'
import { loadNearestEnvFile } from '../dev/env'
import { importProjectFile } from '../project/import-project-file'
import { mergeConfig, removeDevicesWithUsers, removeHistoryWithUsers, type ProjectConfig } from '@protobase/server'

/**
 * Imports the project's protobase.config.ts directly and returns its Better Auth instance. With a device or history
 * store of the app's own (`notifications({ store, historyStore })`), deleting a user removes their devices or history
 * from it too; the built-in tables go with the user by their foreign keys.
 */
export const loadProjectAuth = async (projectDir: string) => {
  loadNearestEnvFile(projectDir)
  const file = path.join(projectDir, 'protobase.config.ts')
  if (!existsSync(file)) throw new Error(`No protobase.config.ts in ${projectDir}; run this inside a project`)
  const module = (await importProjectFile(file)) as { default?: ProjectConfig }
  const project = mergeConfig(module.default ?? {})
  const { auth } = project
  if (!auth) throw new Error('protobase.config.ts does not export `auth`; users are managed by Better Auth')
  if (project.notifications?.store) removeDevicesWithUsers(auth, project.notifications.store)
  if (project.notifications?.historyStore) removeHistoryWithUsers(auth, project.notifications.historyStore)
  return auth
}
