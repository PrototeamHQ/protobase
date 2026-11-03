import type { UpgradeWebSocket } from 'hono/ws'
import type { Db } from '@protobase/query'
import { readDefinitionsVersion, reloadingAdmin, type ErrorReporter } from '@protobase/server'
import type { BuiltProject } from '../config/build-project'
import type { BundleUi } from '../serve/bundle-ui'
import { projectAdmin } from './project-admin'
import { readUserTables } from './project-user-tables'

/**
 * The admin a serving process answers with (`projectAdmin`). With `userTables`, it is rebuilt when the tables users add
 * change (`reloadingAdmin`); the version is read before the tables, so a change between the two reads rebuilds again.
 */
export const servedAdmin = async (project: BuiltProject, db: Db, ui?: BundleUi, reporter?: ErrorReporter, upgradeWebSocket?: UpgradeWebSocket) => {
  if (!project.userTables) return projectAdmin(project, db, ui, reporter, upgradeWebSocket)
  const version = await readDefinitionsVersion(db)
  const tables = await readUserTables(db)
  const built = projectAdmin(project, db, ui, reporter, upgradeWebSocket, tables)
  const admin = reloadingAdmin({
    first: built.admin,
    version,
    readVersion: () => readDefinitionsVersion(db),
    readTables: () => readUserTables(db),
    build: (changed) => projectAdmin(project, db, ui, reporter, upgradeWebSocket, changed).admin,
    report: built.report,
    ...(project.options?.statementTimeoutMs !== undefined && { statementTimeoutMs: project.options.statementTimeoutMs }),
  })
  return { ...built, admin }
}
