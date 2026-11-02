import { builtInResources, configExports, webhooksModule } from '@protobase/server/config-exports'
import type { ResourceModel } from '@protobase/schema'
import type { MergedConfig } from '../config/merge-config'
import type { Issue } from './check'

/**
 * The resources and views Protobase adds to an app by what its config enables, as the API serves them: the webhook ones
 * of `webhooks`, then Failed jobs, Activity and Comments by what the app's resources use. Doctor checks them as it checks
 * the app's own.
 */
export const builtInModels = (config: MergedConfig, models: ResourceModel[]) => {
  const webhooks = config.webhooks ? configExports(webhooksModule(config.webhooks)) : { resources: [], views: [] }
  const webhookModels = webhooks.resources.map((resource) => resource.toModel())
  const added = builtInResources({ models: [...webhookModels, ...models], jobs: Object.keys(config.jobs).length > 0, notifications: config.notifications !== undefined, ...(config.events && { events: config.events }) })
  return {
    models: [...webhookModels, ...added.resources.map((resource) => resource.toModel())],
    views: [...webhooks.views, ...added.views].map((view) => view.toModel()),
  }
}

/**
 * A missing index on a built-in table as a recommendation: the app owns its schema, so a database migrated by an earlier
 * version still serves, and only the reads that need the index are refused until `protobase migration` writes it.
 */
export const builtInIndexIssues = (issues: Issue[]): Issue[] =>
  issues.map((issue) => ({ ...issue, severity: 'warning', suggestion: `write it as a migration with \`protobase migration\` (${issue.suggestion})` }))
