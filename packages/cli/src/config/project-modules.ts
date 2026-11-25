import { configExports, neededModules } from '@protobase/server'
import { runtimeModel, storeNames } from '@protobase/server/internal'
import { authTarget } from '../migration/snapshot/auth-target'
import type { BuiltProject } from './build-project'
import { mailFeedbackOn } from './mail-feedback-config'
import { readOnlyQueriesOn } from './read-only-queries'
import type { MergedConfig } from './merge-config'
import { unsubscribeOn } from './unsubscribe-config'
import { userTablesOn } from './user-tables-config'
import { projectJobs, projectNotifications, projectResources, projectWebhooks } from './project-parts'

// The schema modules an app needs (`neededModules`), from the app as it serves or from its config alone, which
// `protobase migration` reads without a database.

const models = (config: BuiltProject['config']) => {
  const { resources, views } = configExports(config)
  return { models: resources.map((resource) => resource.toModel()), views: views.map((view) => view.toModel()) }
}

/** The schema modules of the app `project` serves. */
export const builtModules = (project: BuiltProject) =>
  neededModules({
    ...models(project.config),
    jobs: project.jobs,
    signIn: Boolean(project.auth),
    ...(project.auth && { authStore: storeNames(project.auth) }),
    mailFeedback: project.mailFeedback,
    unsubscribe: Boolean(project.unsubscribe),
    webhooks: project.webhooks,
    workflows: project.workflows,
    notifications: project.notifications,
    status: project.status,
    calls: project.calls,
    realtime: project.realtime,
    events: project.events,
    userTables: project.userTables,
    readOnlyQueries: readOnlyQueriesOn(project.options?.assistant, process.env),
  })

/** The model the app `project` reads of its database's record of migrations (`runtimeModel`). */
export const builtRuntimeModel = (project: BuiltProject) => runtimeModel(project.auth, builtModules(project))

/** The schema modules of the app `config` makes, from the config alone. */
export const configModules = async (config: MergedConfig) => {
  const [resources, webhooks, notifications, auth] = await Promise.all([projectResources(config), projectWebhooks(config), projectNotifications(config), authTarget(config)])
  return neededModules({
    ...models(resources),
    jobs: projectJobs(config),
    signIn: Boolean(config.auth),
    ...(auth && { authStore: auth.names }),
    mailFeedback: mailFeedbackOn(config),
    unsubscribe: unsubscribeOn(config),
    webhooks,
    workflows: config.workflows,
    notifications,
    status: config.status,
    calls: config.calls,
    realtime: config.realtime,
    events: config.events,
    userTables: userTablesOn(config),
    readOnlyQueries: readOnlyQueriesOn(config.assistant, process.env),
  })
}
