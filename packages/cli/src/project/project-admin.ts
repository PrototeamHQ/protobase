import type { Db } from '@protobase/query'
import { configExports, createAdmin, jobDefinitions, type Authenticator, type ErrorReporter, type ProjectConfig } from '@protobase/server'
import type { BundleUi } from '../serve/bundle-ui'

/**
 * The admin API of a project over `db`, as `dev`, `serve` and `worker` build it: its config module's resources, views,
 * pages and subscriptions, and the rest of its config; served from a bundle, the plugins it carries and their field
 * types. `jobs` are the project's own and the delivery of its events and history. With a `reporter`, every error the API turns
 * into a 500 goes to the error tracker too, besides the project's `onUnhandledError` or the console.
 */
export const projectAdmin = (project: ProjectConfig & { authenticate: Authenticator }, config: Record<string, unknown>, db: Db, ui?: BundleUi, reporter?: ErrorReporter) => {
  const { resources, views, pages, userMenu, bottomBars, subscriptions } = configExports(config)
  const own = jobDefinitions(project.jobs ?? {})
  const unhandled = project.options?.onUnhandledError ?? ((error: unknown) => console.error(error))
  const admin = createAdmin({
    resources,
    views,
    pages,
    ...(userMenu && { userMenu }),
    bottomBars,
    db,
    authenticate: project.authenticate,
    ...(project.auth && { auth: project.auth }),
    ...(project.functions && { functions: project.functions }),
    ...(project.files && { files: project.files }),
    ...(project.events && { events: project.events }),
    ...(project.history && { history: project.history }),
    ...(project.webhooks && { webhooks: project.webhooks }),
    jobs: own,
    subscriptions,
    ...(ui && { bundlePlugins: ui.plugins, fieldTypes: ui.fieldTypes }),
    options: {
      ...project.options,
      onUnhandledError: (error, request) => {
        reporter?.report(error, request)
        unhandled(error, request)
      },
    },
  })
  return { admin, jobs: [...own, ...admin.jobs] }
}
