import type { ResourceModel } from '@protobase/schema'
import { moduleDifference } from '../schema-modules/module-difference'
import { neededModules } from '../schema-modules/needed-modules'
import { schemaModules, targetIds } from '../schema-modules/modules'
import type { EventsOptions } from './events-options'

/**
 * The change capture `models` need, as a migration writes it on a database without it: the change capture module, and
 * the history and notices tables when a resource has history or live updates. The jobs schema it enqueues into is not
 * part of it (`jobsSchemaSql`).
 */
export const captureSchemaSql = (models: readonly ResourceModel[], events?: EventsOptions) => {
  const targets = neededModules({ models, views: [], jobs: [], signIn: false, ...(events && { events }) })
  return targetIds(targets)
    .filter((id) => id !== 'jobs')
    .map((id) => moduleDifference(schemaModules[id], targets[id]!, undefined).sql!)
    .join('\n\n')
}
