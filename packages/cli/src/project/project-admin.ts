import type { UpgradeWebSocket } from 'hono/ws'
import type { Db } from '@protobase/query'
import { configExports, createAdmin, type ErrorReporter, type UserTables } from '@protobase/server'
import type { BuiltProject } from '../config/build-project'
import type { BundleUi } from '../serve/bundle-ui'

/**
 * The admin API of a built project over `db`, as `dev`, `serve` and `worker` run it: its config module's resources,
 * views, pages and subscriptions, and the rest of its config; served from a bundle, the plugins it carries, their field
 * types and which icons are the project's own (`protobase dev` passes the project's icons alone). `jobs` are the
 * project's own and the delivery of its events and history. With a `reporter`, every error the API turns into a 500,
 * and every stopped query, goes to the error tracker too, besides the project's `onUnhandledError` or the console. With
 * the host's `upgradeWebSocket`, it serves `/api/sb/realtime/v1` too. With `userTables`, the tables users add serve
 * beside the config's resources (see `readUserTables`). `report` is what the admin does with an unhandled error.
 */
export const projectAdmin = (project: BuiltProject, db: Db, ui?: BundleUi, reporter?: ErrorReporter, upgradeWebSocket?: UpgradeWebSocket, userTables?: UserTables) => {
  const { resources, views, pages, userMenu, bottomBars, subscriptions } = configExports(project.config)
  const unhandled = project.options?.onUnhandledError ?? ((error: unknown) => console.error(error))
  const report = (error: unknown, request?: Request) => {
    reporter?.report(error, request)
    unhandled(error, request)
  }
  const admin = createAdmin({
    resources,
    views,
    ...(userTables && { userTables }),
    pages,
    ...(userMenu && { userMenu }),
    bottomBars,
    db,
    authenticate: project.authenticate,
    ...(project.secret && { secret: project.secret }),
    ...(project.auth && { auth: project.auth }),
    ...(project.functions && { functions: project.functions }),
    ...(project.files && { files: project.files }),
    ...(project.events && { events: project.events }),
    ...(project.history && { history: project.history }),
    ...(project.webhooks && { webhooks: project.webhooks }),
    ...(project.workflows && { workflows: project.workflows }),
    ...(project.realtime && { realtime: project.realtime }),
    ...(project.notifications && { notifications: project.notifications }),
    ...(project.status && { status: project.status }),
    ...(project.pushRelay && { pushRelay: project.pushRelay }),
    ...(project.calls && { calls: project.calls }),
    ...(project.mobile && { mobile: project.mobile }),
    ...(project.app && { app: project.app }),
    ...(ui?.icons && { icons: ui.icons }),
    jobs: project.jobs,
    subscriptions,
    ...(ui && { bundlePlugins: ui.plugins, fieldTypes: ui.fieldTypes }),
    ...(upgradeWebSocket && { upgradeWebSocket }),
    options: {
      ...project.options,
      onUnhandledError: report,
    },
  })
  return { admin, jobs: [...project.jobs, ...admin.jobs], report }
}
