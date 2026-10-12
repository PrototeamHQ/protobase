import type { Db } from '@protobase/query'
import { configExports, createAdmin, jobDefinitions, type Authenticator, type ProjectConfig } from '@protobase/server'
import type { BundleUi } from '../serve/bundle-ui'

/**
 * The admin API of a project over `db`, as `dev`, `serve` and `worker` build it: its config module's resources, views,
 * pages and subscriptions, and the rest of its config; served from a bundle, the plugins it carries. `jobs` are the
 * project's own and the delivery of its events.
 */
export const projectAdmin = (project: ProjectConfig & { authenticate: Authenticator }, config: Record<string, unknown>, db: Db, ui?: BundleUi) => {
  const { resources, views, pages, userMenu, bottomBars, subscriptions } = configExports(config)
  const own = jobDefinitions(project.jobs ?? {})
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
    ...(project.webhooks && { webhooks: project.webhooks }),
    jobs: own,
    subscriptions,
    ...(ui && { bundlePlugins: ui.plugins }),
    options: { onUnhandledError: (error) => console.error(error), ...project.options },
  })
  return { admin, jobs: [...own, ...admin.jobs] }
}
